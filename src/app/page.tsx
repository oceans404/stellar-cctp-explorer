"use client";

import { SearchBar } from "@/components/SearchBar";
import { RecentTransactions } from "@/components/RecentTransactions";

export default function HomePage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", padding: "1.5rem 0" }}>
      <div>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "0.5rem" }}>
          Stellar CCTP Explorer
        </h1>
        <p style={{ color: "var(--sds-clr-gray-09)", margin: 0 }}>
          Track USDC transfers through Circle&apos;s Cross-Chain Transfer Protocol involving Stellar.
        </p>
      </div>

      <SearchBar />

      <RecentTransactions />
    </div>
  );
}
