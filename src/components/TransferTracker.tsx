"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Loader } from "@stellar/design-system";
import { useNetwork } from "@/context/network";
import { BurnPhase } from "./BurnPhase";
import { AttestationPhase } from "./AttestationPhase";
import { RelayPhase } from "./RelayPhase";

import type { TransferStatus, NetworkConfig } from "@/lib/types";
import { chainSlugToDomain } from "@/lib/config";

interface TransferTrackerProps {
  chainSlug: string;
  txHash: string;
}

async function fetchTransferStatus(
  sourceDomain: number,
  txHash: string,
  network: string
): Promise<TransferStatus> {
  const res = await fetch(`/api/transfer/${sourceDomain}/${txHash}?network=${network}`);

  if (res.status === 404) {
    const body = await res.json();
    throw new NotFoundError(body.detail ?? "Transfer not found");
  }
  if (res.status === 503) {
    throw new RateLimitError(parseInt(res.headers.get("Retry-After") ?? "10", 10));
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  return res.json();
}

class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

class RateLimitError extends Error {
  retryAfter: number;
  constructor(retryAfter: number) {
    super(`Rate limited. Retrying in ${retryAfter}s...`);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

function getRefetchInterval(data: TransferStatus | undefined, fetchCount: number): number | false {
  if (!data) return false;

  // Stop polling when fully resolved
  if (data.relay.checked && data.relay.nonceUsed) return false;

  // Source tx found on-chain but confirmed non-CCTP (no burn event in logs)
  // Skip this check for relay txs — they are valid CCTP but entered from the destination side
  if (data.sourceTx.found && data.sourceTx.isBurn === false && !data.sourceTx.isRelay) return false;

  // Source tx found but no attestation after several polls — likely not a CCTP burn
  if (data.sourceTx.found && !data.attestation.found && fetchCount >= 6) return false;

  // Poll faster when attestation is pending
  if (!data.attestation.found || data.attestation.status === "pending") return 5000;

  // Slower polling when attestation complete but relay not confirmed
  return 10000;
}

export function TransferTracker({ chainSlug, txHash }: TransferTrackerProps) {
  const { config, network } = useNetwork();

  // Mainnet coming-soon state
  const enabledChains = Object.values(config.chains).filter((c) => c.enabled);
  if (enabledChains.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <Alert variant="primary" placement="inline">
          Mainnet support coming soon. Switch to Testnet to track transfers.
        </Alert>
      </div>
    );
  }

  let sourceDomain: number;
  try {
    sourceDomain = chainSlugToDomain(config, chainSlug);
  } catch {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <Alert variant="warning" placement="inline">
          Unknown chain: &quot;{chainSlug}&quot;. Select a valid source chain above.
        </Alert>
      </div>
    );
  }

  return <TransferTrackerInner sourceDomain={sourceDomain} chainSlug={chainSlug} txHash={txHash} network={network} config={config} />;
}

function TransferTrackerInner({
  sourceDomain,
  chainSlug,
  txHash,
  network,
  config,
}: {
  sourceDomain: number;
  chainSlug: string;
  txHash: string;
  network: string;
  config: NetworkConfig;
}) {
  const [gaveUp, setGaveUp] = useState(false);

  const { data, error, isLoading, isFetching } = useQuery<TransferStatus, Error>({
    queryKey: ["transfer", network, sourceDomain, txHash],
    queryFn: () => fetchTransferStatus(sourceDomain, txHash, network),
    refetchInterval: (query) => {
      const fetchCount = query.state.dataUpdateCount;
      return getRefetchInterval(query.state.data, fetchCount);
    },
    retry: (failureCount, err) => {
      if (err instanceof NotFoundError) return failureCount < 2;
      if (err instanceof RateLimitError) return true;
      return failureCount < 3;
    },
    retryDelay: (_, err) => {
      if (err instanceof RateLimitError) return err.retryAfter * 1000;
      return 3000;
    },
  });

  // After 35s without attestation, flag as likely non-CCTP
  const noAttestation = data?.sourceTx.found && !data?.attestation.found;
  useEffect(() => {
    if (!noAttestation) return;
    const timer = setTimeout(() => setGaveUp(true), 35_000);
    return () => clearTimeout(timer);
  }, [noAttestation]);

  const destDomain = data?.decoded?.header.destinationDomain ?? data?.attestation.destDomain;

  // Detect non-CCTP transaction:
  // - EVM/Stellar: isBurn is explicitly false (no burn event in logs/diagnostic events) — immediate
  // - Solana: isBurn is undefined (no source tx lookup yet), wait ~35s before concluding
  // - Relay txs (isRelay=true) are valid CCTP — never treat them as non-CCTP
  const isConfirmedNonCctp = data?.sourceTx.found && data.sourceTx.isBurn === false && !data.sourceTx.isRelay && !data.attestation.found;
  const isMaybeNonCctp = noAttestation && data?.sourceTx.isBurn === undefined && !data?.sourceTx.isRelay && gaveUp;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {isLoading && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "2rem 0" }}>
          <Loader />
          <span style={{ color: "var(--sds-clr-gray-09)" }}>Loading transfer status...</span>
        </div>
      )}

      {error && !data && (
        <Alert
          variant={error instanceof NotFoundError ? "warning" : "error"}
          placement="inline"
        >
          {error instanceof NotFoundError
            ? "Transfer not found. Check the transaction hash and source chain."
            : error instanceof RateLimitError
              ? error.message
              : `Unable to reach tracking service: ${error.message}`}
        </Alert>
      )}

      {isConfirmedNonCctp && (
        <Alert variant="warning" placement="inline">
          This transaction doesn&apos;t contain CCTP events. It may be an approval or other non-burn transaction.
        </Alert>
      )}

      {isMaybeNonCctp && (
        <Alert variant="warning" placement="inline">
          No CCTP attestation found for this transaction. It may not be a CCTP burn.
        </Alert>
      )}

      {data && (
        <>
          {isFetching && !isLoading && !isConfirmedNonCctp && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem", color: "var(--sds-clr-gray-09)" }}>
              <Loader size="1rem" />
              Refreshing...
            </div>
          )}

          <BurnPhase
            sourceTx={data.sourceTx}
            decoded={data.decoded}
            attestation={data.attestation}
            chainSlug={chainSlug}
            txHash={txHash}
            config={config}
          />

          <AttestationPhase
            attestation={data.attestation}
            sourceTxTimestampMs={data.sourceTx.isRelay ? undefined : data.sourceTx.timestampMs}
          />

          <RelayPhase
            relay={data.relay}
            attestation={data.attestation}
            destDomain={destDomain}
            config={config}
            decoded={data.decoded}
            hookData={data.hookData}
          />

        </>
      )}
    </div>
  );
}
