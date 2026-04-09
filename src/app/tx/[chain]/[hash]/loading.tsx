"use client";

import { Loader } from "@stellar/design-system";

export default function TransferLoading() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "2rem 0" }}>
      <Loader />
      <span style={{ color: "var(--sds-clr-gray-09)" }}>Loading transfer...</span>
    </div>
  );
}
