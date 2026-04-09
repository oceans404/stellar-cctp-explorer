import { getNetworkConfig, isValidNetwork, DEFAULT_NETWORK } from "@/lib/networks";
import { fetchAllStellarRouteFees, CHAIN_FEES } from "@/lib/fee-calculator";

// Simple in-memory cache: { [network]: { data, expiry } }
const cache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL_MS = 60_000; // 60 seconds

export async function GET(request: Request) {
  const url = new URL(request.url);
  const networkParam = url.searchParams.get("network") ?? DEFAULT_NETWORK;

  if (!isValidNetwork(networkParam)) {
    return Response.json({ error: `Invalid network: ${networkParam}` }, { status: 400 });
  }

  // Check cache
  const cached = cache.get(networkParam);
  if (cached && Date.now() < cached.expiry) {
    return Response.json(cached.data, {
      headers: { "X-Fee-Cache": "hit" },
    });
  }

  const config = getNetworkConfig(networkParam);

  // Fetch live fees from Iris for all Stellar route pairs
  const apiFees = await fetchAllStellarRouteFees(config.irisApiBase);

  const payload = {
    network: networkParam,
    chainFees: CHAIN_FEES,
    liveFees: apiFees,
    fetchedAt: new Date().toISOString(),
  };

  // Cache the result
  cache.set(networkParam, { data: payload, expiry: Date.now() + CACHE_TTL_MS });

  return Response.json(payload, {
    headers: { "X-Fee-Cache": "miss" },
  });
}
