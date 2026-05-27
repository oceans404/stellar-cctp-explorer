"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, Loader } from "@stellar/design-system";
import Link from "next/link";
import { useNetwork } from "@/context/network";
import { domainName } from "@/lib/config";
import { timeAgo, truncateHash } from "@/lib/utils";
import type { RecentBurnTx } from "@/lib/types";

export function RecentTransactions() {
  const { network } = useNetwork();

  const { data, isLoading } = useQuery<{ txs: RecentBurnTx[] }>({
    queryKey: ["recent-txs", network],
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/recent-txs?network=${network}`, { signal });
      return res.json();
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const txs = data?.txs ?? [];

  return (
    <Card>
      <h3 style={{ margin: "0 0 0.75rem", fontSize: "1rem", fontWeight: 600, color: "var(--sds-clr-gray-12)" }}>
        Recent Stellar CCTP Transfers (All Chains)
      </h3>

      {isLoading && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "1rem 0" }}>
          <Loader size="1rem" />
          <span style={{ fontSize: "0.875rem", color: "var(--sds-clr-gray-09)" }}>Loading...</span>
        </div>
      )}

      {!isLoading && txs.length === 0 && (
        <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--sds-clr-gray-09)" }}>
          No recent transfers in the Soroban RPC retention window. New transfers will appear here automatically.
        </p>
      )}

      {txs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {txs.map((tx) => (
            <Link
              key={tx.txHash}
              href={`/tx/${tx.chainSlug}/${tx.txHash}?network=${network}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.5rem 0.75rem",
                borderRadius: "0.5rem",
                textDecoration: "none",
                color: "inherit",
                background: "var(--sds-clr-gray-02)",
                fontSize: "0.8125rem",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
                <span className="mono" style={{ color: "var(--sds-clr-lilac-09)" }}>
                  {truncateHash(tx.txHash, 20)}
                </span>
                <span style={{ color: "var(--sds-clr-gray-09)", fontSize: "0.75rem" }}>
                  {domainName(tx.sourceDomain)} &rarr; {domainName(tx.destinationDomain)}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.125rem" }}>
                <span style={{ fontWeight: 500 }}>{tx.amount} USDC</span>
                <span style={{ color: "var(--sds-clr-gray-09)", fontSize: "0.75rem" }}>
                  {timeAgo(tx.timestampMs)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
