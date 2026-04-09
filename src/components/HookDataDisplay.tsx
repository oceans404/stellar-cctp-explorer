"use client";

import { Card, Badge, CopyText } from "@stellar/design-system";
import type { HookData } from "@/lib/types";

interface HookDataDisplayProps {
  hookData: HookData;
}

export function HookDataDisplay({ hookData }: HookDataDisplayProps) {
  // For ASCII-decoded hookData (EVM→Stellar), magic/version/selfRelay are empty/zero
  const hasStructuredFields = hookData.version !== 0 || hookData.isSelfRelay;

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "var(--sds-clr-gray-12)" }}>
          hookData (Stellar recipient)
        </h3>
        <Badge variant={hookData.isValid ? "success" : "error"} size="sm">
          {hookData.isValid ? "Valid" : "Invalid"}
        </Badge>
      </div>

      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.5rem 1rem", margin: 0, fontSize: "0.875rem" }}>
        <dt style={{ color: "var(--sds-clr-gray-09)" }}>Recipient</dt>
        <dd style={{ margin: 0 }}>
          {hookData.recipient ? (
            <CopyText textToCopy={hookData.recipient} variant="ellipsis">
              {hookData.recipient}
            </CopyText>
          ) : (
            <span style={{ color: "var(--sds-clr-gray-09)" }}>—</span>
          )}
        </dd>

        <dt style={{ color: "var(--sds-clr-gray-09)" }}>Type</dt>
        <dd style={{ margin: 0 }}>{hookData.recipientType}</dd>

        {hasStructuredFields && (
          <>
            <dt style={{ color: "var(--sds-clr-gray-09)" }}>Self-relay</dt>
            <dd style={{ margin: 0 }}>{hookData.isSelfRelay ? "Yes" : "No"}</dd>

            <dt style={{ color: "var(--sds-clr-gray-09)" }}>Version</dt>
            <dd style={{ margin: 0 }}>{hookData.version}</dd>
          </>
        )}
      </dl>
    </Card>
  );
}
