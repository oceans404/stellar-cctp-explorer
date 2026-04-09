import { getNetworkConfig, isValidNetwork, DEFAULT_NETWORK } from "@/lib/networks";
import { DOMAIN_NAMES } from "@/lib/config";
import { getTransferStatus } from "@/lib/track-transfer";

const TX_HASH_RE = /^(0x)?[0-9a-fA-F]{64}$/;
const SOLANA_SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{32,88}$/;

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Uint8Array) {
    return "0x" + Array.from(value).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return value;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sourceDomain: string; txHash: string }> }
) {
  const { sourceDomain: domainStr, txHash } = await params;

  // Validate sourceDomain
  const sourceDomain = parseInt(domainStr, 10);
  if (isNaN(sourceDomain) || !(sourceDomain in DOMAIN_NAMES)) {
    return Response.json(
      { error: `Unknown source domain: ${domainStr}` },
      { status: 400 }
    );
  }

  // Validate txHash format (hex for EVM/Stellar, base58 for Solana)
  if (!TX_HASH_RE.test(txHash) && !SOLANA_SIG_RE.test(txHash)) {
    return Response.json(
      { error: "Invalid transaction hash format" },
      { status: 400 }
    );
  }

  // Resolve network from query param
  const url = new URL(request.url);
  const networkParam = url.searchParams.get("network") ?? DEFAULT_NETWORK;
  if (!isValidNetwork(networkParam)) {
    return Response.json(
      { error: `Invalid network: ${networkParam}` },
      { status: 400 }
    );
  }

  const config = getNetworkConfig(networkParam);

  try {
    const status = await getTransferStatus(config, sourceDomain, txHash);

    if (!status.attestation.found && !status.sourceTx.found) {
      return Response.json(
        { error: "Transfer not found", detail: status.attestation.detail },
        { status: 404 }
      );
    }

    return new Response(JSON.stringify(status, jsonReplacer), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes("rate limit") || message.includes("429")) {
      return new Response(
        JSON.stringify({ error: "Rate limited. Please retry shortly." }),
        { status: 503, headers: { "Content-Type": "application/json", "Retry-After": "10" } }
      );
    }

    return Response.json(
      { error: "Internal server error", detail: message },
      { status: 500 }
    );
  }
}
