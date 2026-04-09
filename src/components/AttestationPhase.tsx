"use client";

import { Card, Badge, CopyText } from "@stellar/design-system";
import type { AttestationInfo } from "@/lib/types";
import { domainName } from "@/lib/config";
import { formatDuration } from "@/lib/utils";

interface AttestationPhaseProps {
  attestation: AttestationInfo;
  sourceTxTimestampMs?: number;
}

export function AttestationPhase({ attestation, sourceTxTimestampMs }: AttestationPhaseProps) {
  const isPending = attestation.status === "pending";
  const isComplete = attestation.status === "complete";

  // Elapsed time since burn
  let elapsed: string | null = null;
  if (sourceTxTimestampMs) {
    const endTime = attestation.attestedAtMs ?? Date.now();
    elapsed = formatDuration(endTime - sourceTxTimestampMs);
  }

  const srcDomain = attestation.sourceDomain;
  const dstDomain = attestation.destDomain;

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "var(--sds-clr-gray-12)" }}>
          2. Retrieve Attestation from Circle
        </h3>
        {attestation.found && (
          <Badge variant={isComplete ? "success" : "warning"}>
            {isComplete ? "Complete" : "Pending"}
          </Badge>
        )}
        {!attestation.found && (
          <Badge variant="secondary">
            Awaiting
          </Badge>
        )}
      </div>

      {!attestation.found && (
        <p style={{ color: "var(--sds-clr-gray-09)", fontSize: "0.875rem", margin: 0 }}>
          {attestation.detail ?? "Waiting for Iris to index this transfer..."}
        </p>
      )}

      {attestation.found && (
        <>
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.5rem 1rem", margin: 0, fontSize: "0.875rem" }}>
          {attestation.cctpVersion !== undefined && (
            <>
              <dt style={{ color: "var(--sds-clr-gray-09)" }}>CCTP version</dt>
              <dd style={{ margin: 0 }}>V{attestation.cctpVersion}</dd>
            </>
          )}

          {srcDomain !== undefined && dstDomain !== undefined && (
            <>
              <dt style={{ color: "var(--sds-clr-gray-09)" }}>Route</dt>
              <dd style={{ margin: 0 }}>{domainName(srcDomain)} → {domainName(dstDomain)}</dd>
            </>
          )}

          {elapsed && (
            <>
              <dt style={{ color: "var(--sds-clr-gray-09)" }}>
                {isComplete ? "Attested in" : "Elapsed"}
              </dt>
              <dd style={{ margin: 0 }}>{elapsed}</dd>
            </>
          )}

          {attestation.attestedAt && (
            <>
              <dt style={{ color: "var(--sds-clr-gray-09)" }}>Attested at</dt>
              <dd style={{ margin: 0 }}>{new Date(attestation.attestedAt).toLocaleString()}</dd>
            </>
          )}

          {attestation.eventNonce && (
            <>
              <dt style={{ color: "var(--sds-clr-gray-09)" }}>Nonce</dt>
              <dd style={{ margin: 0 }}>
                <CopyText textToCopy={attestation.eventNonce} variant="ellipsis">
                  {attestation.eventNonce}
                </CopyText>
              </dd>
            </>
          )}

          {attestation.sender && (
            <>
              <dt style={{ color: "var(--sds-clr-gray-09)" }}>Sender</dt>
              <dd style={{ margin: 0 }}>
                <CopyText textToCopy={attestation.sender} variant="ellipsis">
                  {attestation.sender}
                </CopyText>
              </dd>
            </>
          )}

          {attestation.recipient && (
            <>
              <dt style={{ color: "var(--sds-clr-gray-09)" }}>Recipient</dt>
              <dd style={{ margin: 0 }}>
                <CopyText textToCopy={attestation.recipient} variant="ellipsis">
                  {attestation.recipient}
                </CopyText>
              </dd>
            </>
          )}

          {attestation.destinationCaller && attestation.destinationCaller !== "0x0000000000000000000000000000000000000000000000000000000000000000" && (
            <>
              <dt style={{ color: "var(--sds-clr-gray-09)" }}>Destination caller</dt>
              <dd style={{ margin: 0 }}>
                <CopyText textToCopy={attestation.destinationCaller} variant="ellipsis">
                  {attestation.destinationCaller}
                </CopyText>
              </dd>
            </>
          )}

          {attestation.amount && (
            <>
              <dt style={{ color: "var(--sds-clr-gray-09)" }}>Amount</dt>
              <dd style={{ margin: 0 }}>{attestation.amount} USDC</dd>
            </>
          )}

          {attestation.fee && (
            <>
              <dt style={{ color: "var(--sds-clr-gray-09)" }}>Fee</dt>
              <dd style={{ margin: 0 }}>{attestation.fee}</dd>
            </>
          )}

          {attestation.finalityThreshold && (
            <>
              <dt style={{ color: "var(--sds-clr-gray-09)" }}>Finality threshold</dt>
              <dd style={{ margin: 0 }}>
                {attestation.finalityThreshold}
                {attestation.finalityThresholdExecuted && attestation.finalityThresholdExecuted !== attestation.finalityThreshold
                  ? ` (executed: ${attestation.finalityThresholdExecuted})`
                  : ""}
              </dd>
            </>
          )}

          {attestation.delayReason && (
            <>
              <dt style={{ color: "var(--sds-clr-gray-09)" }}>Delay reason</dt>
              <dd style={{ margin: 0, color: "var(--sds-clr-gold-11)" }}>{attestation.delayReason}</dd>
            </>
          )}

          {isPending && (
            <>
              <dt style={{ color: "var(--sds-clr-gray-09)" }}>Status</dt>
              <dd style={{ margin: 0, color: "var(--sds-clr-gold-11)" }}>
                Waiting for Circle attestation service...
              </dd>
            </>
          )}
        </dl>
        <p style={{ margin: "1rem 0 0", fontSize: "0.75rem", color: "var(--sds-clr-gray-09)" }}>
          Attestation is performed off-chain by Circle&apos;s attestation service.
        </p>
        </>
      )}
    </Card>
  );
}
