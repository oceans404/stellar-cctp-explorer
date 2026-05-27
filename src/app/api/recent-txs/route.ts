import { NextRequest, NextResponse } from "next/server";
import { xdr } from "@stellar/stellar-sdk";
import { getNetworkConfig, isValidNetwork, DEFAULT_NETWORK } from "@/lib/networks";
import { getStellarChain } from "@/lib/config";
import type { RecentBurnTx } from "@/lib/types";

// ---------------------------------------------------------------------------
// Cache (30s TTL per network)
// ---------------------------------------------------------------------------

const cache = new Map<string, { data: RecentBurnTx[]; expiry: number }>();

// ---------------------------------------------------------------------------
// Soroban RPC helper
// ---------------------------------------------------------------------------

let rpcId = 1;

async function rpcCall(
  rpcUrl: string,
  method: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }),
  });
  if (!res.ok) throw new Error(`Soroban RPC HTTP ${res.status}`);
  const json = (await res.json()) as { result?: unknown; error?: { message?: string } };
  if (json.error) throw new Error(json.error.message ?? "RPC error");
  return json.result;
}

// ---------------------------------------------------------------------------
// Fetch recent Stellar CCTP activity from TokenMessengerMinter events
// ---------------------------------------------------------------------------

/** Try to extract a BigInt amount from an ScVal (u128/i128/u64/u32). */
function tryAmount(val: xdr.ScVal): bigint | null {
  const t = val.switch().name;
  if (t === "scvU128") {
    const hi = BigInt(val.u128().hi().toString());
    const lo = BigInt(val.u128().lo().toString());
    return (hi << 64n) | lo;
  }
  if (t === "scvI128") {
    const hi = BigInt(val.i128().hi().toString());
    const lo = BigInt(val.i128().lo().toString());
    return (hi << 64n) | lo;
  }
  if (t === "scvU64") return BigInt(val.u64().toString());
  if (t === "scvU32") return BigInt(val.u32());
  return null;
}

/** Extract named fields from an scvMap. */
function mapFields(val: xdr.ScVal): Record<string, xdr.ScVal> | null {
  if (val.switch().name !== "scvMap") return null;
  const result: Record<string, xdr.ScVal> = {};
  for (const entry of val.map() ?? []) {
    if (entry.key().switch().name === "scvSymbol") {
      result[entry.key().sym().toString()] = entry.val();
    }
  }
  return result;
}

async function fetchRecentStellarActivity(
  rpcUrl: string,
  tokenMessengerMinter: string,
  messageTransmitter: string,
  cctpForwarder: string,
  chainSlug: string,
): Promise<RecentBurnTx[]> {
  const info = (await rpcCall(rpcUrl, "getLatestLedger", {})) as {
    sequence?: number;
  };
  const latest = info.sequence ?? 0;
  // Fetch recent CCTP events. We scan two windows:
  // 1. "Now" window (last ~10 min) — catches very recent activity
  // 2. "Recent" window (last ~14 hours) — catches older activity
  // This ensures new events appear immediately without being buried
  // behind older ones in the pagination limit.
  const contracts = [tokenMessengerMinter, messageTransmitter, cctpForwarder];
  const allEvents: Array<{ txHash: string; topic: string[]; value: string; ledgerClosedAt?: string; contractId?: string }> = [];

  // Window 1: last ~10 minutes (most important — shows fresh activity)
  const nowStart = Math.max(1, latest - 120);
  const nowResult = (await rpcCall(rpcUrl, "getEvents", {
    startLedger: nowStart,
    filters: [{ type: "contract", contractIds: contracts }],
    pagination: { limit: 60 },
  })) as { events?: typeof allEvents };
  allEvents.push(...(nowResult.events ?? []));

  // Window 2: last ~14 hours (backfill if the feed is sparse)
  if (allEvents.length < 40) {
    const recentStart = Math.max(1, latest - 10000);
    const recentResult = (await rpcCall(rpcUrl, "getEvents", {
      startLedger: recentStart,
      filters: [{ type: "contract", contractIds: contracts }],
      pagination: { limit: 100 },
    })) as { events?: typeof allEvents };
    allEvents.push(...(recentResult.events ?? []));
  }

  // Group events by txHash — each CCTP transfer emits events on multiple
  // contracts, and different events carry different fields:
  //   - mint_and_withdraw (TokenMessengerMinter): amount, fee_collected
  //   - message_received (MessageTransmitter): source_domain, sender
  //   - mint_and_forward (CctpForwarder): amount, forward_recipient
  //   - deposit_for_burn (TokenMessengerMinter): amount, destination_domain
  //   - message_sent (MessageTransmitter): raw message bytes
  const grouped = new Map<string, {
    amount: bigint | null;
    sourceDomain: number | null;
    destDomain: number | null;
    type: "in" | "out" | null;
    timestampMs: number;
  }>();

  for (const ev of allEvents) {
    try {
      let eventName = "";
      if (ev.topic?.[0]) {
        const t0 = xdr.ScVal.fromXDR(Buffer.from(ev.topic[0], "base64"));
        if (t0.switch().name === "scvSymbol") eventName = t0.sym().toString();
      }

      const fields = mapFields(xdr.ScVal.fromXDR(Buffer.from(ev.value, "base64")));
      if (!fields) continue;

      const timestampMs = ev.ledgerClosedAt
        ? new Date(ev.ledgerClosedAt).getTime()
        : Date.now();

      const entry = grouped.get(ev.txHash) ?? {
        amount: null, sourceDomain: null, destDomain: null, type: null, timestampMs,
      };

      if (eventName === "deposit_for_burn") {
        entry.type = "out";
        entry.sourceDomain = 27;
        entry.destDomain = fields["destination_domain"] ? Number(tryAmount(fields["destination_domain"]) ?? 0) : null;
        entry.amount = fields["amount"] ? tryAmount(fields["amount"]) : entry.amount;
      } else if (eventName === "mint_and_withdraw" || eventName === "mint_and_forward") {
        if (!entry.type) entry.type = "in";
        entry.destDomain = 27;
        entry.amount = fields["amount"] ? tryAmount(fields["amount"]) : entry.amount;
      } else if (eventName === "message_received") {
        entry.sourceDomain = fields["source_domain"] ? Number(tryAmount(fields["source_domain"]) ?? 0) : entry.sourceDomain;
      } else if (eventName === "message_sent") {
        // message_sent has {message: bytes} — parse sourceDomain/destDomain from the raw CCTP message
        if (fields["message"]?.switch().name === "scvBytes") {
          const msgBytes = Buffer.from(fields["message"].bytes());
          if (msgBytes.length >= 12) {
            entry.sourceDomain = msgBytes.readUInt32BE(4);
            entry.destDomain = msgBytes.readUInt32BE(8);
          }
        }
      }

      grouped.set(ev.txHash, entry);
    } catch {
      continue;
    }
  }

  const txs: RecentBurnTx[] = [];
  for (const [txHash, entry] of grouped) {
    if (entry.amount === null) continue;

    // Stellar USDC uses 7 decimals; CCTP uses 6. The mint_and_withdraw/mint_and_forward
    // events report amounts in Stellar's 7-decimal format, while deposit_for_burn
    // uses CCTP's 6-decimal format. Normalize to 6 decimals for display.
    const amount = entry.type === "in" ? entry.amount / 10n : entry.amount;
    const whole = amount / 1_000_000n;
    const frac = (amount % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "").padEnd(2, "0");

    txs.push({
      txHash,
      chainSlug,
      amount: `${whole}.${frac}`,
      sourceDomain: entry.sourceDomain ?? 0,
      destinationDomain: entry.destDomain ?? 27,
      timestampMs: entry.timestampMs,
    });
  }

  // Most recent first
  txs.sort((a, b) => b.timestampMs - a.timestampMs);
  return txs;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const networkParam = request.nextUrl.searchParams.get("network") ?? DEFAULT_NETWORK;
  if (!isValidNetwork(networkParam)) {
    return NextResponse.json(
      { txs: [], error: `Invalid network: ${networkParam}` },
      { status: 400 },
    );
  }
  const network = networkParam;

  const cacheKey = `recent:${network}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() < cached.expiry) {
    return NextResponse.json(
      { txs: cached.data },
      { headers: { "X-Cache": "hit" } },
    );
  }

  try {
    const config = getNetworkConfig(network);

    if (!config.enabled) {
      return NextResponse.json(
        { txs: [], error: "Network not yet enabled" },
        { status: 503 },
      );
    }

    const stellar = getStellarChain(config);
    if (!stellar) {
      return NextResponse.json({ txs: [] });
    }

    const stellarSlug = Object.entries(config.chains)
      .find(([, c]) => c.type === "stellar")?.[0] ?? "stellar";

    const txs = await fetchRecentStellarActivity(
      stellar.rpcUrl,
      stellar.tokenMessengerMinter,
      stellar.messageTransmitter,
      stellar.cctpForwarder,
      stellarSlug,
    );

    cache.set(cacheKey, { data: txs, expiry: Date.now() + 30_000 });

    return NextResponse.json(
      { txs },
      { headers: { "X-Cache": "miss" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ txs: [], error: message }, { status: 500 });
  }
}
