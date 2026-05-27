import type { NetworkName, NetworkConfig } from "../types";
import { testnetConfig } from "./testnet";
import { mainnetConfig } from "./mainnet";
import { applyEnvOverrides, rpcEnvVarName } from "./env-overrides";

const configs: Record<NetworkName, NetworkConfig> = {
  testnet: testnetConfig,
  mainnet: mainnetConfig,
};

const resolved = new Map<NetworkName, NetworkConfig>();

export function getNetworkConfig(network: NetworkName): NetworkConfig {
  const cached = resolved.get(network);
  if (cached) return cached;

  const config = applyEnvOverrides(configs[network]);

  // RPC URL validation runs server-side only. Env vars aren't NEXT_PUBLIC_
  // prefixed (by design, see env-overrides.ts), so the client never sees
  // them and would always throw here. Server callers still get an eager
  // check; client code reads config for metadata and never touches rpcUrl.
  if (typeof window === "undefined" && config.enabled) {
    for (const [slug, chain] of Object.entries(config.chains)) {
      if (!chain.enabled) continue;
      if (!chain.rpcUrl || chain.rpcUrl.length === 0) {
        throw new Error(
          `Missing RPC URL for chain "${slug}" on network "${network}". Set env var ${rpcEnvVarName(slug)}.`
        );
      }
    }
  }

  resolved.set(network, config);
  return config;
}

export function isValidNetwork(value: string): value is NetworkName {
  return value === "testnet" || value === "mainnet";
}

function resolveDefaultNetwork(): NetworkName {
  const fromEnv = process.env.NEXT_PUBLIC_DEFAULT_NETWORK;
  if (fromEnv && isValidNetwork(fromEnv)) return fromEnv;
  return "mainnet";
}

export const DEFAULT_NETWORK: NetworkName = resolveDefaultNetwork();
