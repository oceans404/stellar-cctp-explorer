import type { NetworkConfig, ChainConfig, StellarChainConfig } from "./types";

// ---------------------------------------------------------------------------
// Network-agnostic constants
// ---------------------------------------------------------------------------

export const DOMAIN_NAMES: Record<number, string> = {
  0: "Ethereum",
  1: "Avalanche",
  2: "Optimism",
  3: "Arbitrum",
  4: "Noble",
  5: "Solana",
  6: "Base",
  7: "Polygon",
  8: "Sui",
  26: "Arc",
  27: "Stellar",
};

export const CCTP_USDC_DECIMALS = 6;
export const STELLAR_USDC_DECIMALS = 7;
export const MIN_FINALITY_THRESHOLD = 2000;

// ---------------------------------------------------------------------------
// Chain lookup helpers
// ---------------------------------------------------------------------------

export function getChain(config: NetworkConfig, slug: string): ChainConfig {
  const chain = config.chains[slug];
  if (!chain) {
    const available = Object.keys(config.chains).join(", ");
    throw new Error(`Unknown chain "${slug}". Available: ${available}`);
  }
  return chain;
}

export function getStellarChain(config: NetworkConfig): StellarChainConfig | null {
  const entry = Object.values(config.chains).find((c) => c.type === "stellar");
  return (entry as StellarChainConfig) ?? null;
}

export function chainSlugToDomain(config: NetworkConfig, slug: string): number {
  return getChain(config, slug).domain;
}

export function domainToChainSlug(config: NetworkConfig, domain: number): string | null {
  // Filter on enabled so callers (e.g. burn/relay link rendering) don't
  // produce hrefs to chains that aren't live on this network.
  const entry = Object.entries(config.chains).find(
    ([, c]) => c.domain === domain && c.enabled,
  );
  return entry ? entry[0] : null;
}

export function domainName(domain: number): string {
  return DOMAIN_NAMES[domain] ?? `Unknown(${domain})`;
}

export function explorerTxUrl(config: NetworkConfig, chainSlug: string, txHash: string): string {
  const chain = config.chains[chainSlug];
  if (!chain) return "";

  switch (chain.type) {
    case "evm":
      return `${chain.explorerUrl}/tx/${txHash.startsWith("0x") ? txHash : "0x" + txHash}`;
    case "stellar":
      return `${chain.explorerUrl}/tx/${txHash.startsWith("0x") ? txHash.slice(2) : txHash}`;
    case "solana": {
      const url = new URL(chain.explorerUrl);
      url.pathname = `/tx/${txHash}`;
      return url.toString();
    }
    default:
      return "";
  }
}
