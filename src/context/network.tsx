"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import type { NetworkName, NetworkConfig } from "@/lib/types";
import { getNetworkConfig, isValidNetwork, DEFAULT_NETWORK } from "@/lib/networks";

interface NetworkContextValue {
  network: NetworkName;
  config: NetworkConfig;
  setNetwork: (n: NetworkName) => void;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);

/**
 * Parse network from URL — supports our format (?network=testnet)
 * and Stellar Lab's zustand-querystring format ($=network$id=testnet...;;)
 */
function parseNetworkFromUrl(): NetworkName {
  if (typeof window === "undefined") return DEFAULT_NETWORK;

  const params = new URLSearchParams(window.location.search);

  // Our format: ?network=testnet
  const ours = params.get("network");
  if (ours && isValidNetwork(ours)) return ours;

  // Lab format: ?$=network$id=testnet...;;
  const raw = window.location.search;
  const labMatch = raw.match(/\$=network\$id=([a-z]+)/);
  if (labMatch && isValidNetwork(labMatch[1])) return labMatch[1];

  return DEFAULT_NETWORK;
}

function writeNetworkToUrl(network: NetworkName) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("network", network);
  window.history.replaceState({}, "", url.toString());
}

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [network, setNetworkState] = useState<NetworkName>(DEFAULT_NETWORK);

  useEffect(() => {
    const parsed = parseNetworkFromUrl();
    setNetworkState(parsed);
    writeNetworkToUrl(parsed);
  }, []);

  const setNetwork = useCallback((n: NetworkName) => {
    setNetworkState(n);
    writeNetworkToUrl(n);
  }, []);

  const config = getNetworkConfig(network);

  return (
    <NetworkContext.Provider value={{ network, config, setNetwork }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork(): NetworkContextValue {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error("useNetwork must be used within NetworkProvider");
  return ctx;
}
