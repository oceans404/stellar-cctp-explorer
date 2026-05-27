"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Table, Badge, Card, Select, Input, Button, Alert, Loader } from "@stellar/design-system";
import { useNetwork } from "@/context/network";
import type { ChainFeeConfig, ApiFeeEntry, TransferCostResult } from "@/lib/types";
import {
  CHAIN_FEES,
  getNonStellarChains,
  getStellarFeeConfig,
  calculateTransferCost,
  getChainFee,
} from "@/lib/fee-calculator";

// ---------------------------------------------------------------------------
// Types for the API response
// ---------------------------------------------------------------------------

interface FeeApiResponse {
  network: string;
  chainFees: ChainFeeConfig[];
  liveFees: ApiFeeEntry[] | null;
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// Route row type used by SDS Table
// ---------------------------------------------------------------------------

interface RouteRow extends Record<string, unknown> {
  id: string;
  chain: string;
  domain: number;
  standardFee: string;
  standardTime: string;
  fastFee: string | null;
  fastTime: string | null;
  fastAvailable: boolean;
  liveFeeBps: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STELLAR_DOMAIN = 27;

function formatBps(bps: number): string {
  if (bps === 0) return "Free";
  return `${bps} bps (${(bps / 100).toFixed(2)}%)`;
}

function buildRouteRows(
  direction: "inbound" | "outbound",
  liveFees: ApiFeeEntry[] | null
): RouteRow[] {
  const nonStellar = getNonStellarChains();

  return nonStellar.map((chain) => {
    const srcDomain = direction === "inbound" ? chain.domain : STELLAR_DOMAIN;
    const dstDomain = direction === "inbound" ? STELLAR_DOMAIN : chain.domain;
    const sourceChain = direction === "inbound" ? chain : getStellarFeeConfig();

    const liveFee = liveFees?.find(
      (f) => f.sourceDomain === srcDomain && f.destDomain === dstDomain
    );

    return {
      id: `${direction}-${chain.domain}`,
      chain: chain.name,
      domain: chain.domain,
      standardFee: "Free",
      standardTime: direction === "inbound" ? getStellarFeeConfig().standardTime : chain.standardTime,
      fastFee: sourceChain.fastFeeBps !== null ? formatBps(liveFee?.fastFeeBps ?? sourceChain.fastFeeBps) : null,
      fastTime: sourceChain.fastTime,
      fastAvailable: sourceChain.fastFeeBps !== null,
      liveFeeBps: liveFee?.fastFeeBps ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Table column config
// ---------------------------------------------------------------------------

const ROUTE_COLUMNS = [
  { id: "chain", label: "Chain" },
  { id: "standardFee", label: "Standard Fee" },
  { id: "standardTime", label: "Standard Time" },
  { id: "fastFee", label: "Fast Fee" },
  { id: "fastTime", label: "Fast Time" },
  { id: "fastAvailable", label: "Fast Transfer" },
];

function RouteTableRow({ item }: { item: RouteRow }) {
  return (
    <>
      <td style={{ fontWeight: 500, color: "var(--sds-clr-gray-12)" }}>{item.chain}</td>
      <td>{item.standardFee}</td>
      <td style={{ color: "var(--sds-clr-gray-09)" }}>{item.standardTime}</td>
      <td>{item.fastFee ?? "—"}</td>
      <td style={{ color: "var(--sds-clr-gray-09)" }}>{item.fastTime ?? "—"}</td>
      <td>
        {item.fastAvailable ? (
          <Badge variant="success">Fast Available</Badge>
        ) : (
          <Badge variant="warning">Standard Only</Badge>
        )}
      </td>
    </>
  );
}

// ---------------------------------------------------------------------------
// Fee Calculator sub-component
// ---------------------------------------------------------------------------

interface CalcResults {
  standard: TransferCostResult;
  fast: TransferCostResult;
  fastAvailable: boolean;
}

function FeeCalculator({ liveFees }: { liveFees: ApiFeeEntry[] | null }) {
  const [fromDomain, setFromDomain] = useState<string>(String(CHAIN_FEES[0].domain));
  const [toDomain, setToDomain] = useState<string>(String(STELLAR_DOMAIN));
  const [amount, setAmount] = useState("100");
  const [results, setResults] = useState<CalcResults | null>(null);
  const [error, setError] = useState("");

  function handleCalculate(e?: React.FormEvent) {
    e?.preventDefault();
    setError("");

    const fromChain = getChainFee(Number(fromDomain));
    const toChain = getChainFee(Number(toDomain));

    if (!fromChain || !toChain) {
      setError("Please select valid chains");
      return;
    }
    if (fromChain.domain === toChain.domain) {
      setError("Source and destination must be different chains");
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError("Enter a positive amount");
      return;
    }

    const standard = calculateTransferCost(fromChain, toChain, amountNum, "standard", liveFees);
    const fast = calculateTransferCost(fromChain, toChain, amountNum, "fast", liveFees);
    setResults({ standard, fast, fastAvailable: fromChain.fastFeeBps !== null });
  }

  return (
    <Card>
      <h3 style={{ margin: "0 0 1rem", fontSize: "1rem", fontWeight: 600, color: "var(--sds-clr-gray-12)" }}>
        Transfer Cost Calculator
      </h3>

      <form onSubmit={handleCalculate} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: "160px" }}>
            <Select
              id="calc-from"
              fieldSize="md"
              label="From"
              value={fromDomain}
              onChange={(e) => { setFromDomain(e.target.value); setResults(null); }}
            >
              {CHAIN_FEES.map((c) => (
                <option key={c.domain} value={String(c.domain)}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>

          <div style={{ flex: 1, minWidth: "160px" }}>
            <Select
              id="calc-to"
              fieldSize="md"
              label="To"
              value={toDomain}
              onChange={(e) => { setToDomain(e.target.value); setResults(null); }}
            >
              {CHAIN_FEES.map((c) => (
                <option key={c.domain} value={String(c.domain)}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>

          <div style={{ flex: 1, minWidth: "120px" }}>
            <Input
              id="calc-amount"
              fieldSize="md"
              label="Amount (USDC)"
              placeholder="100"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setResults(null); }}
              type="number"
              min="0"
              step="any"
            />
          </div>

          <Button variant="secondary" size="md" type="submit">
            Calculate
          </Button>
        </div>

        {error && <Alert variant="error" placement="inline">{error}</Alert>}

        {results && (
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            {/* Standard column */}
            <div
              style={{
                flex: 1,
                minWidth: "240px",
                padding: "1rem",
                background: "var(--sds-clr-gray-02)",
                borderRadius: "8px",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--sds-clr-gray-12)" }}>
                  Standard
                </span>
                <Badge variant="secondary">Free</Badge>
              </div>
              <ResultItem label="Fee" value="Free (0 bps)" />
              <ResultItem label="Est. Gas Cost" value={`~$${results.standard.estimatedGasCostUsd.toFixed(4)}`} />
              <ResultItem label="Total Cost" value={`~$${results.standard.totalCostUsd.toFixed(4)}`} />
              <ResultItem label="Amount Received" value={`${results.standard.amountReceived.toLocaleString()} USDC`} />
              <ResultItem label="Est. Time" value={results.standard.estimatedTime} />
            </div>

            {/* Fast column */}
            <div
              style={{
                flex: 1,
                minWidth: "240px",
                padding: "1rem",
                background: "var(--sds-clr-gray-02)",
                borderRadius: "8px",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
                opacity: results.fastAvailable ? 1 : 0.5,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--sds-clr-gray-12)" }}>
                  Fast
                </span>
                {results.fastAvailable ? (
                  <Badge variant="success">Available</Badge>
                ) : (
                  <Badge variant="warning">Unavailable</Badge>
                )}
                {results.fast.feeSource === "api" && results.fastAvailable && (
                  <Badge variant="success">Live</Badge>
                )}
              </div>
              {results.fastAvailable ? (
                <>
                  <ResultItem
                    label="Fee"
                    value={`${results.fast.feeUsd.toFixed(4)} USDC (${results.fast.feeBps} bps)`}
                  />
                  <ResultItem label="Est. Gas Cost" value={`~$${results.fast.estimatedGasCostUsd.toFixed(4)}`} />
                  <ResultItem label="Total Cost" value={`~$${results.fast.totalCostUsd.toFixed(4)}`} />
                  <ResultItem label="Amount Received" value={`${results.fast.amountReceived.toLocaleString()} USDC`} />
                  <ResultItem label="Est. Time" value={results.fast.estimatedTime} />
                </>
              ) : (
                <div style={{ color: "var(--sds-clr-gray-09)", fontSize: "0.8125rem" }}>
                  Fast Transfer is not available from {results.fast.fromChain.name}.
                </div>
              )}
            </div>
          </div>
        )}
      </form>
    </Card>
  );
}

function ResultItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: "0.75rem", color: "var(--sds-clr-gray-09)", marginBottom: "0.25rem" }}>
        {label}
      </div>
      <div style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--sds-clr-gray-12)" }}>
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stellar Notes
// ---------------------------------------------------------------------------

function StellarNotes() {
  return (
    <Card>
      <h3 style={{ margin: "0 0 0.75rem", fontSize: "1rem", fontWeight: 600, color: "var(--sds-clr-gray-12)" }}>
        Stellar-Specific Notes
      </h3>
      <ul style={{ margin: 0, paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "0.5rem", color: "var(--sds-clr-gray-11)" }}>
        <li>
          <strong>Trustline required:</strong> The recipient Stellar account must have a USDC trustline
          before receiving minted USDC. Without it, the mint will fail.
        </li>
        <li>
          <strong>CctpForwarder as mintRecipient:</strong> When sending to Stellar, the CCTP message&apos;s{" "}
          <code style={{ fontSize: "0.8125rem" }}>mintRecipient</code> is the CctpForwarder contract, not the
          end user. The real recipient is encoded in <code style={{ fontSize: "0.8125rem" }}>hookData</code>.
        </li>
        <li>
          <strong>Decimal difference:</strong> CCTP uses 6-decimal USDC (matching EVM), but Stellar USDC
          is 7-decimal. The CctpForwarder handles the conversion (multiply by 10).
        </li>
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FeeReference() {
  const { network } = useNetwork();

  const {
    data,
    isLoading,
    error: fetchError,
  } = useQuery<FeeApiResponse>({
    queryKey: ["fees", network],
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/fees?network=${network}`, { signal });
      if (!res.ok) throw new Error(`Failed to fetch fees: ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 300_000,
  });

  const liveFees = data?.liveFees ?? null;

  const inboundRows = useMemo(() => buildRouteRows("inbound", liveFees), [liveFees]);
  const outboundRows = useMemo(() => buildRouteRows("outbound", liveFees), [liveFees]);

  if (network === "mainnet") {
    return (
      <Alert variant="primary" placement="inline">
        Mainnet fee data is not yet available. Switch to Testnet to view current CCTP fee schedules.
      </Alert>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {fetchError && (
        <Alert variant="warning" placement="inline">
          Unable to fetch live fees from Iris API. Showing estimated values.
        </Alert>
      )}

      {data?.liveFees && (
        <div style={{ fontSize: "0.75rem", color: "var(--sds-clr-gray-09)" }}>
          Live fees from Iris API as of {new Date(data.fetchedAt).toLocaleTimeString()}
          {" "}
          <Badge variant="success">Live</Badge>
        </div>
      )}

      {isLoading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
          <Loader />
        </div>
      ) : (
        <>
          <div>
            <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.125rem", fontWeight: 600, color: "var(--sds-clr-gray-12)" }}>
              Inbound Routes (→ Stellar)
            </h2>
            <Table
              id="inbound-fees"
              data={inboundRows}
              columnLabels={ROUTE_COLUMNS}
              renderItemRow={(item) => <RouteTableRow item={item} />}
              breakpoint={700}
              hideNumberColumn
              emptyMessage="No inbound routes available"
            />
          </div>

          <div>
            <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.125rem", fontWeight: 600, color: "var(--sds-clr-gray-12)" }}>
              Outbound Routes (Stellar →)
            </h2>
            <Table
              id="outbound-fees"
              data={outboundRows}
              columnLabels={ROUTE_COLUMNS}
              renderItemRow={(item) => <RouteTableRow item={item} />}
              breakpoint={700}
              hideNumberColumn
              emptyMessage="No outbound routes available"
            />
          </div>

          <FeeCalculator liveFees={liveFees} />

          <StellarNotes />
        </>
      )}
    </div>
  );
}
