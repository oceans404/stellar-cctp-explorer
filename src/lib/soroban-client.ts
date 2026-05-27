import {
  Contract,
  Account,
  Keypair,
  StrKey,
  TransactionBuilder,
  BASE_FEE,
  xdr,
} from "@stellar/stellar-sdk";
import type { NetworkConfig, SourceTxInfo, RelayInfo } from "./types";
import { getStellarChain } from "./config";

// ---------------------------------------------------------------------------
// JSON-RPC helper
// ---------------------------------------------------------------------------

let rpcIdCounter = 1;

async function rpcCall(
  rpcUrl: string,
  method: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: rpcIdCounter++,
      method,
      params,
    }),
  });

  if (!res.ok) {
    throw new Error(`Soroban RPC HTTP error: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as { result?: unknown; error?: { message?: string } };
  if (json.error) {
    throw new Error(`Soroban RPC error: ${json.error.message ?? JSON.stringify(json.error)}`);
  }
  return json.result;
}

// ---------------------------------------------------------------------------
// getTransaction — fetch Stellar source tx details
// ---------------------------------------------------------------------------

export async function getStellarTransaction(
  config: NetworkConfig,
  txHash: string
): Promise<SourceTxInfo> {
  const stellar = getStellarChain(config);
  if (!stellar) {
    return { found: false, detail: "No Stellar chain configured" };
  }

  const hash = txHash.startsWith("0x") ? txHash.slice(2) : txHash;

  try {
    const result = (await rpcCall(stellar.rpcUrl, "getTransaction", {
      hash,
    })) as {
      status: string;
      ledger?: number;
      createdAt?: string;
      diagnosticEventsXdr?: string[];
    };

    if (result.status === "NOT_FOUND") {
      return { found: false, detail: "Transaction not found on Stellar" };
    }

    const isSuccess = result.status === "SUCCESS";
    const timestampMs = result.createdAt
      ? parseInt(result.createdAt, 10) * 1000
      : undefined;

    const isBurn = isSuccess
      ? detectCctpBurn(result.diagnosticEventsXdr, stellar.tokenMessengerMinter)
      : false;

    // If not a burn, check if it's a relay (receive_message on MessageTransmitter)
    let isRelay = false;
    let relaySourceDomain: number | undefined;
    let relayNonce: string | undefined;
    if (isSuccess && !isBurn) {
      const relayInfo = detectCctpRelay(result.diagnosticEventsXdr, stellar.messageTransmitter);
      if (relayInfo) {
        isRelay = true;
        relaySourceDomain = relayInfo.sourceDomain;
        relayNonce = relayInfo.nonce;
      }
    }

    return {
      found: true,
      block: result.ledger?.toString(),
      timestamp: timestampMs ? new Date(timestampMs).toISOString() : undefined,
      timestampMs,
      status: isSuccess ? "Success" : result.status,
      isBurn,
      isRelay,
      relaySourceDomain,
      relayNonce,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { found: false, detail: message };
  }
}

// ---------------------------------------------------------------------------
// Stellar CCTP burn detection via diagnostic events
// ---------------------------------------------------------------------------

/**
 * Scan diagnostic events for a `deposit_for_burn` or
 * `deposit_for_burn_with_caller` fn_call on the TokenMessengerMinter.
 * Diagnostic events include sub-invocations, so this catches both
 * direct calls and calls routed through the CCTP forwarder.
 */
function detectCctpBurn(
  diagnosticEventsXdr: string[] | undefined,
  tokenMessengerMinter: string,
): boolean {
  if (!diagnosticEventsXdr || diagnosticEventsXdr.length === 0) return false;

  for (const eventBase64 of diagnosticEventsXdr) {
    try {
      const diagEvent = xdr.DiagnosticEvent.fromXDR(eventBase64, "base64");
      const event = diagEvent.event();
      const topics = event.body().v0().topics();

      if (topics.length < 3) continue;

      // topic[0]: "fn_call"
      if (topics[0].switch().name !== "scvSymbol") continue;
      if (topics[0].sym().toString() !== "fn_call") continue;

      // topic[1]: contract ID (raw 32-byte hash)
      if (topics[1].switch().name !== "scvBytes") continue;
      const contractId = StrKey.encodeContract(
        topics[1].bytes() as unknown as Buffer,
      );
      if (contractId !== tokenMessengerMinter) continue;

      // topic[2]: function name
      if (topics[2].switch().name !== "scvSymbol") continue;
      const fnName = topics[2].sym().toString();
      if (
        fnName === "deposit_for_burn" ||
        fnName === "deposit_for_burn_with_caller"
      ) {
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Stellar CCTP relay detection via diagnostic events
// ---------------------------------------------------------------------------

/**
 * Scan diagnostic events for a `receive_message` fn_call on the
 * MessageTransmitter. If found, parse the CCTP message bytes from the
 * call arguments to extract sourceDomain and nonce.
 *
 * The receive_message call has args: [caller (Address), message (Bytes), attestation (Bytes)]
 * The message bytes follow the standard CCTP V2 layout:
 *   version(4) + sourceDomain(4) + destDomain(4) + nonce(32) + ...
 */
function detectCctpRelay(
  diagnosticEventsXdr: string[] | undefined,
  messageTransmitter: string,
): { sourceDomain: number; nonce: string } | null {
  if (!diagnosticEventsXdr || diagnosticEventsXdr.length === 0) return null;

  for (const eventBase64 of diagnosticEventsXdr) {
    try {
      const diagEvent = xdr.DiagnosticEvent.fromXDR(eventBase64, "base64");
      const event = diagEvent.event();
      const topics = event.body().v0().topics();

      if (topics.length < 3) continue;

      // topic[0]: "fn_call"
      if (topics[0].switch().name !== "scvSymbol") continue;
      if (topics[0].sym().toString() !== "fn_call") continue;

      // topic[1]: contract ID
      if (topics[1].switch().name !== "scvBytes") continue;
      const contractId = StrKey.encodeContract(
        topics[1].bytes() as unknown as Buffer,
      );
      if (contractId !== messageTransmitter) continue;

      // topic[2]: function name
      if (topics[2].switch().name !== "scvSymbol") continue;
      if (topics[2].sym().toString() !== "receive_message") continue;

      // Parse the call arguments from the data ScVal
      const dataVal = event.body().v0().data();
      if (dataVal.switch().name !== "scvVec") continue;

      const args = dataVal.vec() ?? [];
      // arg[1] is the CCTP message bytes
      if (args.length < 2) continue;
      if (args[1].switch().name !== "scvBytes") continue;

      const msgBytes = args[1].bytes();
      if (msgBytes.length < 44) continue;

      const buf = Buffer.from(msgBytes);
      const sourceDomain = buf.readUInt32BE(4);
      const nonce =
        "0x" +
        Array.from(buf.subarray(12, 44))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

      return { sourceDomain, nonce };
    } catch {
      continue;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// simulateIsNonceUsed — check nonce on Stellar MessageTransmitter
// ---------------------------------------------------------------------------

export async function simulateIsNonceUsed(
  config: NetworkConfig,
  nonceHash: `0x${string}`,
  nonce?: Uint8Array,
): Promise<RelayInfo> {
  const stellar = getStellarChain(config);
  if (!stellar) {
    return { checked: false, detail: "No Stellar chain configured" };
  }

  try {
    const contract = new Contract(stellar.messageTransmitter);
    const hashHex = nonceHash.startsWith("0x") ? nonceHash.slice(2) : nonceHash;
    const hashBytes = Uint8Array.from(
      hashHex.match(/.{2}/g)!.map((b) => parseInt(b, 16))
    );
    const nonceScVal = xdr.ScVal.scvBytes(Buffer.from(hashBytes));

    // Build a throwaway source account for simulation (no signing needed)
    const sourceKey = Keypair.random();
    const account = new Account(sourceKey.publicKey(), "0");
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: stellar.networkPassphrase,
    })
      .addOperation(contract.call("is_nonce_used", nonceScVal))
      .setTimeout(30)
      .build();

    const result = (await rpcCall(stellar.rpcUrl, "simulateTransaction", {
      transaction: tx.toXDR(),
    })) as {
      error?: string;
      results?: Array<{ xdr: string }>;
    };

    if (result.error) {
      return { checked: false, detail: `Simulation error: ${result.error}` };
    }

    const retXdr = result.results?.[0]?.xdr;
    if (!retXdr) {
      return { checked: false, detail: "No return value from simulation" };
    }

    const scVal = xdr.ScVal.fromXDR(retXdr, "base64");
    const nonceUsed = scVal.value() === true;

    // If nonce is used and we have the raw nonce, find the relay tx
    let relayTxHash: string | undefined;
    if (nonceUsed && nonce) {
      relayTxHash = await findStellarRelayTx(stellar.rpcUrl, stellar.messageTransmitter, nonce);
    }

    return { checked: true, nonceUsed, relayTxHash };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { checked: false, detail: message };
  }
}

// ---------------------------------------------------------------------------
// Find Stellar burn tx via getEvents (reverse lookup)
// ---------------------------------------------------------------------------

/**
 * Search for the Stellar burn tx that produced a given CCTP message.
 *
 * Gotcha: the Stellar MessageTransmitter emits the `message_sent` event
 * with the nonce field zeroed out — the real nonce is assigned after
 * event emission. So we match by comparing the CCTP message excluding
 * the nonce bytes (bytes 12-43): same prefix + same suffix = same transfer.
 *
 * Strategy (tried in order):
 * 1. Soroban `getEvents` — scan `message_sent` events on the
 *    MessageTransmitter. Limited by RPC retention window (~7 days).
 * 2. Horizon operations — query the sender account's recent
 *    `invoke_host_function` operations and check diagnostic events.
 *    Horizon retains much longer history.
 */
const BURN_MAX_PAGES = 5;

export async function findStellarBurnTx(
  config: NetworkConfig,
  cctpMessage: Uint8Array,
  senderAddress?: string,
): Promise<string | undefined> {
  // Strategy 1: Soroban getEvents
  const fromEvents = await findBurnTxViaEvents(config, cctpMessage);
  if (fromEvents) return fromEvents;

  // Strategy 2: Horizon account operations (needs sender address)
  if (senderAddress) {
    return findBurnTxViaHorizon(config, cctpMessage, senderAddress);
  }

  return undefined;
}

/**
 * Compare two CCTP V2 messages ignoring fields that are assigned after
 * the on-chain event emission:
 *   - bytes 12-43:  nonce (assigned by MessageTransmitter after event)
 *   - bytes 144-147: finalityThresholdExecuted (filled by attestation)
 *
 * Header layout: version(4) + srcDomain(4) + dstDomain(4) + nonce(32)
 *   + sender(32) + recipient(32) + destCaller(32)
 *   + minFinalityThreshold(4) + finalityThresholdExecuted(4) = 148
 */
function cctpMessageMatchesIgnoringNonce(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length || a.length < 148) return false;
  // version + srcDomain + dstDomain (bytes 0-11)
  if (!a.subarray(0, 12).equals(b.subarray(0, 12))) return false;
  // sender + recipient + destCaller + minFinalityThreshold (bytes 44-143)
  if (!a.subarray(44, 144).equals(b.subarray(44, 144))) return false;
  // body (bytes 148+)
  return a.subarray(148).equals(b.subarray(148));
}

async function findBurnTxViaEvents(
  config: NetworkConfig,
  cctpMessage: Uint8Array,
): Promise<string | undefined> {
  const stellar = getStellarChain(config);
  if (!stellar) return undefined;

  const { rpcUrl, messageTransmitter } = stellar;
  const topic0 = xdr.ScVal.scvSymbol("message_sent").toXDR("base64");
  const filter = {
    type: "contract" as const,
    contractIds: [messageTransmitter],
    topics: [[topic0]],
  };

  const targetMsg = Buffer.from(cctpMessage);

  let startLedger: number;
  try {
    const info = (await rpcCall(rpcUrl, "getLatestLedger", {})) as {
      sequence?: number;
      oldestLedger?: number;
    };
    const latest = info.sequence ?? 0;
    const oldest = info.oldestLedger ?? 0;
    startLedger = Math.max(oldest, latest - 50000);
  } catch {
    return undefined;
  }

  let cursor: string | undefined;
  for (let page = 0; page < BURN_MAX_PAGES; page++) {
    try {
      const params: Record<string, unknown> = {
        filters: [filter],
        pagination: { limit: 100, ...(cursor ? { cursor } : {}) },
      };
      if (!cursor) {
        params.startLedger = startLedger;
      }

      const result = (await rpcCall(rpcUrl, "getEvents", params)) as {
        events?: Array<{ txHash: string; value: string }>;
        cursor?: string;
        latestLedger?: number;
      };

      if (result.events) {
        for (const ev of result.events) {
          try {
            const scVal = xdr.ScVal.fromXDR(Buffer.from(ev.value, "base64"));
            if (scVal.switch().name !== "scvMap") continue;
            const entries = scVal.map() ?? [];
            for (const entry of entries) {
              if (entry.key().switch().name !== "scvSymbol") continue;
              if (entry.key().sym().toString() !== "message") continue;
              if (entry.val().switch().name !== "scvBytes") continue;
              const eventMsg = Buffer.from(entry.val().bytes());
              if (cctpMessageMatchesIgnoringNonce(eventMsg, targetMsg)) {
                return ev.txHash;
              }
            }
          } catch {
            continue;
          }
        }
      }

      if (!result.cursor) break;
      const cursorLedger = parseInt(result.cursor.split("-")[0], 10) >> 32;
      if (result.latestLedger && cursorLedger >= result.latestLedger) break;
      cursor = result.cursor;
    } catch {
      break;
    }
  }

  return undefined;
}

/**
 * Fallback: search Horizon for the burn tx via the sender account's
 * recent operations. This works beyond the Soroban event retention window.
 *
 * We look for `invoke_host_function` operations from the sender and check
 * the transaction's diagnostic events for a `message_sent` event whose
 * CCTP message matches (ignoring nonce) the target message.
 */
async function findBurnTxViaHorizon(
  config: NetworkConfig,
  cctpMessage: Uint8Array,
  senderAddress: string,
): Promise<string | undefined> {
  const stellar = getStellarChain(config);
  if (!stellar) return undefined;

  const targetMsg = Buffer.from(cctpMessage);

  const horizonBase = stellar.horizonUrl;

  try {
    const url = `${horizonBase}/accounts/${senderAddress}/operations?order=desc&limit=50&include_failed=false`;
    const res = await fetch(url);
    if (!res.ok) return undefined;

    const data = (await res.json()) as {
      _embedded?: { records?: Array<{
        type: string;
        transaction_hash: string;
      }> };
    };

    const ops = data._embedded?.records ?? [];
    const invokeOps = ops.filter((op) => op.type === "invoke_host_function");

    for (const op of invokeOps) {
      const txHash = op.transaction_hash;
      try {
        const txResult = (await rpcCall(stellar.rpcUrl, "getTransaction", {
          hash: txHash,
        })) as {
          status: string;
          diagnosticEventsXdr?: string[];
        };

        if (txResult.status !== "SUCCESS") continue;
        if (!txResult.diagnosticEventsXdr) continue;

        if (hasBurnWithMatchingMessage(txResult.diagnosticEventsXdr, stellar.tokenMessengerMinter, targetMsg)) {
          return txHash;
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Horizon lookup failed — non-critical
  }

  return undefined;
}

/**
 * Check if a transaction's diagnostic events contain a deposit_for_burn
 * and a message_sent event whose CCTP message matches the target (ignoring nonce).
 */
function hasBurnWithMatchingMessage(
  diagnosticEventsXdr: string[],
  tokenMessengerMinter: string,
  targetMsg: Buffer,
): boolean {
  let isBurn = false;
  let messageMatches = false;

  for (const eventBase64 of diagnosticEventsXdr) {
    try {
      const diagEvent = xdr.DiagnosticEvent.fromXDR(eventBase64, "base64");
      const event = diagEvent.event();
      const topics = event.body().v0().topics();

      if (topics.length === 0) continue;
      if (topics[0].switch().name !== "scvSymbol") continue;
      const t0 = topics[0].sym().toString();

      // Check for deposit_for_burn (fn_call diagnostic event)
      if (t0 === "fn_call" && topics.length >= 3 && topics[1].switch().name === "scvBytes") {
        const contractId = StrKey.encodeContract(
          topics[1].bytes() as unknown as Buffer,
        );
        const fnName = topics[2].switch().name === "scvSymbol" ? topics[2].sym().toString() : "";

        if (contractId === tokenMessengerMinter &&
            (fnName === "deposit_for_burn" || fnName === "deposit_for_burn_with_caller")) {
          isBurn = true;
        }
      }

      // Check for message_sent contract event
      if (t0 === "message_sent") {
        const dataVal = event.body().v0().data();
        if (dataVal.switch().name !== "scvMap") continue;
        for (const entry of (dataVal.map() ?? [])) {
          if (entry.key().switch().name !== "scvSymbol") continue;
          if (entry.key().sym().toString() !== "message") continue;
          if (entry.val().switch().name !== "scvBytes") continue;
          const eventMsg = Buffer.from(entry.val().bytes());
          if (cctpMessageMatchesIgnoringNonce(eventMsg, targetMsg)) {
            messageMatches = true;
          }
        }
      }
    } catch {
      continue;
    }
  }

  return isBurn && messageMatches;
}

// ---------------------------------------------------------------------------
// Find Stellar relay tx via getEvents
// ---------------------------------------------------------------------------

/**
 * Search for a `message_received` event on the MessageTransmitter contract
 * matching a specific nonce. Returns the tx hash if found.
 *
 * Uses `getEvents` with positional topic filters:
 *   topic[0] = "message_received" (symbol)
 *   topic[1] = * (caller — any)
 *   topic[2] = nonce (bytes)
 *   topic[3] = * (finality — any)
 *
 * IMPORTANT: The topics filter must be a SINGLE inner array with positional
 * matchers, NOT separate arrays per position. See SorobanGotcha.md.
 *
 * The RPC scans ~10k ledgers per call, so we use cursor pagination
 * starting from the oldest available ledger (up to MAX_PAGES calls).
 */
const MAX_PAGES = 5;

async function findStellarRelayTx(
  rpcUrl: string,
  messageTransmitter: string,
  nonce: Uint8Array,
): Promise<string | undefined> {
  const topic0 = xdr.ScVal.scvSymbol("message_received").toXDR("base64");
  const topic2 = xdr.ScVal.scvBytes(Buffer.from(nonce)).toXDR("base64");
  const filter = {
    type: "contract" as const,
    contractIds: [messageTransmitter],
    topics: [[topic0, "*", topic2, "*"]],
  };

  // Start searching from recent history (each getEvents call scans ~10k
  // ledgers, so 50k covers ~3 days at ~5s/ledger). Starting from the
  // oldest available ledger would require too many paginated calls.
  let startLedger: number;
  try {
    const info = (await rpcCall(rpcUrl, "getLatestLedger", {})) as {
      sequence?: number;
      oldestLedger?: number;
    };
    const latest = info.sequence ?? 0;
    const oldest = info.oldestLedger ?? 0;
    startLedger = Math.max(oldest, latest - 50000);
  } catch {
    return undefined;
  }

  // Paginate through the event index (each call scans ~10k ledgers)
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    try {
      const params: Record<string, unknown> = {
        filters: [filter],
        pagination: { limit: 1, ...(cursor ? { cursor } : {}) },
      };
      if (!cursor) {
        params.startLedger = startLedger;
      }

      const result = (await rpcCall(rpcUrl, "getEvents", params)) as {
        events?: Array<{ txHash: string }>;
        cursor?: string;
        latestLedger?: number;
      };

      if (result.events && result.events.length > 0) {
        return result.events[0].txHash;
      }

      // No more pages to scan
      if (!result.cursor) break;

      // Check if we've reached the latest ledger
      const cursorLedger = parseInt(result.cursor.split("-")[0], 10) >> 32;
      if (result.latestLedger && cursorLedger >= result.latestLedger) break;

      cursor = result.cursor;
    } catch {
      break;
    }
  }

  return undefined;
}
