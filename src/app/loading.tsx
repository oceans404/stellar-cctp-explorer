"use client";

import { Loader } from "@stellar/design-system";

export default function Loading() {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "4rem 0" }}>
      <Loader />
    </div>
  );
}
