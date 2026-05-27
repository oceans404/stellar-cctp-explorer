import type { NetworkConfig, NetworkName, AttestationInfo, NonceLookupResult } from "./types";

// ---------------------------------------------------------------------------
// Token bucket rate limiter (25 req/s budget, per network)
// ---------------------------------------------------------------------------

const BUCKET_CAPACITY = 25;
const REFILL_RATE = 25; // tokens per second

const buckets = new Map<NetworkName, { tokens: number; lastRefill: number }>();

function acquireToken(network: NetworkName): boolean {
  let bucket = buckets.get(network);
  if (!bucket) {
    bucket = { tokens: BUCKET_CAPACITY, lastRefill: Date.now() };
    buckets.set(network, bucket);
  }

  const now = Date.now();
  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(BUCKET_CAPACITY, bucket.tokens + elapsed * REFILL_RATE);
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Response cache (5s TTL per key)
// ---------------------------------------------------------------------------

const cache = new Map<string, { data: AttestationInfo; expiry: number }>();

function getCached(key: string): AttestationInfo | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: AttestationInfo): void {
  cache.set(key, { data, expiry: Date.now() + 5000 });
}

// ---------------------------------------------------------------------------
// Fetch attestation
// ---------------------------------------------------------------------------

export async function fetchAttestation(
  config: NetworkConfig,
  sourceDomain: number,
  txHash: string
): Promise<AttestationInfo> {
  const cacheKey = `${config.id}:${sourceDomain}:${txHash}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  if (!acquireToken(config.id)) {
    return { found: false, detail: "Rate limited — try again in a moment" };
  }

  const irisUrl = `${config.irisApiBase}/v2/messages/${sourceDomain}?transactionHash=${txHash}`;

  try {
    const res = await fetch(irisUrl);

    if (res.status === 404) {
      return { found: false, detail: "Not yet indexed by Iris (try again in 10-30s)" };
    }
    if (res.status === 429) {
      return { found: false, detail: "Iris rate limited (wait 30s)" };
    }
    if (!res.ok) {
      return { found: false, detail: `Iris returned HTTP ${res.status}` };
    }

    const data = await res.json() as { messages?: Array<Record<string, unknown>> };
    const messages = data.messages;

    if (!messages || messages.length === 0) {
      return { found: false, detail: "Iris returned empty messages array (not indexed yet)" };
    }

    const msg = messages[0];

    const isPending =
      !msg.attestation ||
      msg.attestation === "PENDING" ||
      msg.attestation === "";

    const status: "pending" | "complete" = isPending ? "pending" : "complete";

    let amount: string | undefined;
    if (msg.amount !== undefined && msg.amount !== null) {
      const raw = BigInt(msg.amount as string);
      const whole = raw / 1000000n;
      const frac = (raw % 1000000n).toString().padStart(6, "0");
      amount = `${whole}.${frac}`;
    }

    let attestedAtMs: number | undefined;
    if (msg.updated_at && status === "complete") {
      attestedAtMs = new Date(msg.updated_at as string).getTime();
    }

    const decoded = msg.decodedMessage as Record<string, unknown> | undefined;

    const result: AttestationInfo = {
      found: true,
      status,
      attestation: isPending ? undefined : (msg.attestation as string),
      message: msg.message as string | undefined,
      amount,
      eventNonce: msg.eventNonce as string | undefined,
      sourceDomain: msg.sourceDomain !== undefined ? Number(msg.sourceDomain)
        : decoded?.sourceDomain !== undefined ? Number(decoded.sourceDomain) : undefined,
      destDomain: msg.destinationDomain !== undefined ? Number(msg.destinationDomain)
        : decoded?.destinationDomain !== undefined ? Number(decoded.destinationDomain) : undefined,
      fee: msg.fee as string | undefined,
      finalityThreshold: (decoded?.minFinalityThreshold ?? msg.finalityThreshold ?? msg.minFinalityThreshold) as string | undefined,
      finalityThresholdExecuted: decoded?.finalityThresholdExecuted as string | undefined,
      cctpVersion: msg.cctpVersion as number | undefined,
      delayReason: msg.delayReason as string | null | undefined,
      sender: decoded?.sender as string | undefined,
      recipient: decoded?.recipient as string | undefined,
      destinationCaller: decoded?.destinationCaller as string | undefined,
      attestedAt: msg.updated_at as string | undefined,
      attestedAtMs,
    };

    setCache(cacheKey, result);
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { found: false, detail: message };
  }
}

// ---------------------------------------------------------------------------
// Fetch message by nonce (reverse lookup from decoded message)
// ---------------------------------------------------------------------------

export async function fetchMessageByNonce(
  config: NetworkConfig,
  sourceDomain: number,
  nonce: string,
): Promise<NonceLookupResult> {
  if (!acquireToken(config.id)) {
    return { found: false, detail: "Rate limited — try again in a moment" };
  }

  const url = `${config.irisApiBase}/v2/messages/${sourceDomain}?nonce=${nonce}`;

  try {
    const res = await fetch(url);

    if (res.status === 404) {
      return { found: false, detail: "Not found — message may not be indexed by Iris yet" };
    }
    if (res.status === 429) {
      return { found: false, detail: "Iris rate limited (wait 30s)" };
    }
    if (!res.ok) {
      return { found: false, detail: `Iris returned HTTP ${res.status}` };
    }

    const data = await res.json() as { messages?: Array<Record<string, unknown>> };
    const messages = data.messages;

    if (!messages || messages.length === 0) {
      return { found: false, detail: "Iris returned empty results — not indexed yet" };
    }

    const msg = messages[0];

    const isPending =
      !msg.attestation ||
      msg.attestation === "PENDING" ||
      msg.attestation === "";

    return {
      found: true,
      status: isPending ? "pending" : "complete",
      attestation: isPending ? undefined : (msg.attestation as string),
      message: msg.message as string | undefined,
      cctpVersion: msg.cctpVersion as number | undefined,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { found: false, detail: message };
  }
}
