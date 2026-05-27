import type { NetworkConfig, ChainConfig } from "../types";

/**
 * Compute the env var name for a chain's RPC URL override.
 * Example: "stellar-testnet" -> "STELLAR_TESTNET_RPC_URL".
 */
export function rpcEnvVarName(chainSlug: string): string {
  return `${chainSlug.toUpperCase().replace(/-/g, "_")}_RPC_URL`;
}

/**
 * Apply env-var overrides for RPC URLs to a network config.
 * Server-side only — env vars are not NEXT_PUBLIC_ prefixed so API keys
 * embedded in RPC URLs do not leak to the client bundle.
 */
export function applyEnvOverrides(config: NetworkConfig): NetworkConfig {
  const chains: Record<string, ChainConfig> = {};

  for (const [slug, chain] of Object.entries(config.chains)) {
    const envVar = rpcEnvVarName(slug);
    const override = process.env[envVar];
    if (override && override.length > 0) {
      chains[slug] = { ...chain, rpcUrl: override };
    } else {
      chains[slug] = chain;
    }
  }

  return { ...config, chains };
}
