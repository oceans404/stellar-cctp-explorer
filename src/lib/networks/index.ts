import type { NetworkName, NetworkConfig } from "../types";
import { testnetConfig } from "./testnet";
import { mainnetConfig } from "./mainnet";

const configs: Record<NetworkName, NetworkConfig> = {
  testnet: testnetConfig,
  mainnet: mainnetConfig,
};

export function getNetworkConfig(network: NetworkName): NetworkConfig {
  return configs[network];
}

export function isValidNetwork(value: string): value is NetworkName {
  return value === "testnet" || value === "mainnet";
}

export const DEFAULT_NETWORK: NetworkName = "testnet";
