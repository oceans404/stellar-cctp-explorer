import type { Metadata } from "next";
import { FeeReference } from "@/components/FeeReference";

export const metadata: Metadata = {
  title: "Fee & Route Reference",
  description:
    "CCTP fee schedules, route timing estimates, and transfer cost calculator for all Stellar cross-chain USDC routes.",
};

export default function FeesPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", padding: "1.5rem 0" }}>
      <div>
        <h1 style={{ margin: "0 0 0.25rem", fontSize: "1.5rem", fontWeight: 600, color: "var(--sds-clr-gray-12)" }}>
          Fee &amp; Route Reference
        </h1>
        <p style={{ margin: 0, color: "var(--sds-clr-gray-09)", fontSize: "0.875rem" }}>
          All Stellar CCTP routes with fees, estimated transfer times, and an interactive cost calculator.
        </p>
      </div>
      <FeeReference />
    </div>
  );
}
