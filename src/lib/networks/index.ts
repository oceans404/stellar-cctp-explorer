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

  if (config.enabled) {
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
  return "testnet";
}

export const DEFAULT_NETWORK: NetworkName = resolveDefaultNetwork();
