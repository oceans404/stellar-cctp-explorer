import type { Metadata } from "next";
import { MessageDecoder } from "@/components/MessageDecoder";

export const metadata: Metadata = {
  title: "CCTP Message Decoder",
  description:
    "Decode raw CCTP V2 message hex into human-readable fields. Optionally look up attestation status via Circle's Iris API.",
};

export default function DecodePage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", padding: "1.5rem 0" }}>
      <div>
        <h1 style={{ margin: "0 0 0.25rem", fontSize: "1.5rem", fontWeight: 600, color: "var(--sds-clr-gray-12)" }}>
          CCTP Message Decoder
        </h1>
        <p style={{ margin: 0, color: "var(--sds-clr-gray-09)", fontSize: "0.875rem" }}>
          Paste raw CCTP message hex to see a human-readable breakdown.
        </p>
      </div>
      <MessageDecoder />
    </div>
  );
}
