import type { ChainFeeConfig, IrisFeeEntry, ApiFeeEntry, TransferCostResult } from "./types";

// ---------------------------------------------------------------------------
// Chain fee registry (ported from tools/src/fee-calculator.ts:73-154)
// ---------------------------------------------------------------------------

export const CHAIN_FEES: ChainFeeConfig[] = [
  {
    domain: 0,
    name: "Ethereum",
    fastFeeBps: 1,
    standardTime: "~15 minutes",
    fastTime: "~16 seconds",
    estimatedGasCostUsd: 2.5,
  },
  {
    domain: 1,
    name: "Avalanche",
    fastFeeBps: null,
    standardTime: "~few seconds",
    fastTime: null,
    estimatedGasCostUsd: 0.02,
  },
  {
    domain: 2,
    name: "OP Mainnet",
    fastFeeBps: 1.3,
    standardTime: "~15-20 minutes",
    fastTime: "~4 seconds",
    estimatedGasCostUsd: 0.01,
  },
  {
    domain: 3,
    name: "Arbitrum",
    fastFeeBps: 1.3,
    standardTime: "~15-20 minutes",
    fastTime: "~4 seconds",
    estimatedGasCostUsd: 0.01,
  },
  {
    domain: 5,
    name: "Solana",
    fastFeeBps: 1,
    standardTime: "~few seconds",
    fastTime: "~8 seconds",
    estimatedGasCostUsd: 0.005,
  },
  {
    domain: 6,
    name: "Base",
    fastFeeBps: 1.3,
    standardTime: "~15-20 minutes",
    fastTime: "~4 seconds",
    estimatedGasCostUsd: 0.01,
  },
  {
    domain: 7,
    name: "Polygon PoS",
    fastFeeBps: null,
    standardTime: "~8 minutes",
    fastTime: null,
    estimatedGasCostUsd: 0.01,
  },
  {
    domain: 27,
    name: "Stellar",
    fastFeeBps: 1,
    standardTime: "~few seconds",
    fastTime: "~few seconds",
    estimatedGasCostUsd: 0.001,
  },
];

/** Stellar domain ID */
const STELLAR_DOMAIN = 27;

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

export function getChainFee(domain: number): ChainFeeConfig | undefined {
  return CHAIN_FEES.find((c) => c.domain === domain);
}

export function findChainFeeByName(input: string): ChainFeeConfig | null {
  const lower = input.toLowerCase().trim();
  return (
    CHAIN_FEES.find(
      (c) => c.name.toLowerCase() === lower || c.name.toLowerCase().startsWith(lower)
    ) ?? null
  );
}

/** All non-Stellar chains (for building route pairs) */
export function getNonStellarChains(): ChainFeeConfig[] {
  return CHAIN_FEES.filter((c) => c.domain !== STELLAR_DOMAIN);
}

/** The Stellar chain config */
export function getStellarFeeConfig(): ChainFeeConfig {
  return CHAIN_FEES.find((c) => c.domain === STELLAR_DOMAIN)!;
}

// ---------------------------------------------------------------------------
// Iris fee API — per-route fetching
// GET /v2/burn/USDC/fees/{sourceDomain}/{destDomain}
// Returns: [{ finalityThreshold: 1000, minimumFee: X }, { finalityThreshold: 2000, minimumFee: 0 }]
// ---------------------------------------------------------------------------

async function fetchRouteFee(
  irisApiBase: string,
  sourceDomain: number,
  destDomain: number,
  signal?: AbortSignal
): Promise<ApiFeeEntry | null> {
  const url = `${irisApiBase}/v2/burn/USDC/fees/${sourceDomain}/${destDomain}`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;

    const data: unknown = await res.json();
    if (!Array.isArray(data)) return null;

    const entries = data as IrisFeeEntry[];
    const fast = entries.find((e) => e.finalityThreshold === 1000);
    const standard = entries.find((e) => e.finalityThreshold === 2000);

    return {
      sourceDomain,
      destDomain,
      fastFeeBps: fast?.minimumFee ?? 0,
      standardFeeBps: standard?.minimumFee ?? 0,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch live fees from Iris for all Stellar route pairs.
 * Queries inbound (X→Stellar) and outbound (Stellar→X) for each non-Stellar chain.
 * Returns null if all requests fail.
 */
export async function fetchAllStellarRouteFees(
  irisApiBase: string
): Promise<ApiFeeEntry[] | null> {
  const nonStellar = getNonStellarChains();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const promises: Promise<ApiFeeEntry | null>[] = [];

    for (const chain of nonStellar) {
      // Inbound: chain → Stellar
      promises.push(fetchRouteFee(irisApiBase, chain.domain, STELLAR_DOMAIN, controller.signal));
      // Outbound: Stellar → chain
      promises.push(fetchRouteFee(irisApiBase, STELLAR_DOMAIN, chain.domain, controller.signal));
    }

    const results = await Promise.all(promises);
    const valid = results.filter((r): r is ApiFeeEntry => r !== null);
    return valid.length > 0 ? valid : null;
  } finally {
    clearTimeout(timeout);
  }
}

function lookupApiFee(
  apiFees: ApiFeeEntry[] | null,
  sourceDomain: number,
  destDomain: number
): number | null {
  if (!apiFees) return null;
  const entry = apiFees.find(
    (f) => f.sourceDomain === sourceDomain && f.destDomain === destDomain
  );
  return entry ? entry.fastFeeBps : null;
}

// ---------------------------------------------------------------------------
// Transfer cost calculation (ported from fee-calculator.ts:267-321)
// ---------------------------------------------------------------------------

export function calculateTransferCost(
  from: ChainFeeConfig,
  to: ChainFeeConfig,
  amount: number,
  speed: "standard" | "fast",
  apiFees: ApiFeeEntry[] | null
): TransferCostResult {
  const fastAvailable = from.fastFeeBps !== null;

  let feeBps = 0;
  let feeSource: "api" | "estimate" = "estimate";
  let estimatedTime: string;

  if (speed === "fast" && fastAvailable) {
    const apiFee = lookupApiFee(apiFees, from.domain, to.domain);
    if (apiFee !== null) {
      feeBps = apiFee;
      feeSource = "api";
    } else {
      feeBps = from.fastFeeBps!;
      feeSource = "estimate";
    }
    estimatedTime = from.fastTime ?? from.standardTime;
  } else {
    feeBps = 0;
    feeSource = "estimate";
    estimatedTime = to.standardTime;
  }

  const feeUsd = (amount * feeBps) / 10000;
  const amountReceived = amount - feeUsd;
  const estimatedGasCostUsd = to.estimatedGasCostUsd;
  const totalCostUsd = feeUsd + estimatedGasCostUsd;

  return {
    fromChain: from,
    toChain: to,
    amount,
    speed,
    feeBps,
    feeUsd,
    estimatedGasCostUsd,
    totalCostUsd,
    amountReceived,
    estimatedTime,
    fastAvailable,
    feeSource,
  };
}
