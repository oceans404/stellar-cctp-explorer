"use client";

import { Card, Badge, CopyText } from "@stellar/design-system";
import type { RelayInfo, AttestationInfo, NetworkConfig, ParsedCctpMessage, HookData } from "@/lib/types";
import { domainName, explorerTxUrl, CCTP_USDC_DECIMALS } from "@/lib/config";
import { formatUsdc, truncateHash } from "@/lib/utils";

import { StrKey } from "@stellar/stellar-sdk";

/** Decode a bytes32 hex string to a readable address */
function decodeAddress(hex: string, domain?: number): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = Uint8Array.from(clean.match(/.{2}/g)!.map((b) => parseInt(b, 16)));

  if (domain === 27) {
    try {
      const ed = StrKey.encodeEd25519PublicKey(bytes as unknown as Buffer);
      if (StrKey.isValidEd25519PublicKey(ed)) return ed;
    } catch { /* ignore */ }
    try {
      const c = StrKey.encodeContract(bytes as unknown as Buffer);
      if (StrKey.isValidContract(c)) return c;
    } catch { /* ignore */ }
  }

  if (domain !== 27 && /^0{24}[0-9a-fA-F]{40}$/.test(clean)) {
    return "0x" + clean.slice(24);
  }

  return "0x" + clean;
}

interface RelayPhaseProps {
  relay: RelayInfo;
  attestation: AttestationInfo;
  destDomain?: number;
  config: NetworkConfig;
  decoded: ParsedCctpMessage | null;
  hookData: HookData | null;
}

export function RelayPhase({ relay, attestation, destDomain, config, decoded, hookData }: RelayPhaseProps) {
  const isComplete = attestation.status === "complete";
  const isMinted = relay.checked && relay.nonceUsed;

  // Find dest chain slug for explorer link
  const destChainSlug = destDomain !== undefined
    ? Object.values(config.chains).find((c) => c.domain === destDomain)?.slug
    : undefined;

  // Resolve the actual USDC recipient:
  // - Stellar destination with hookData: the decoded G... address
  // - EVM destination: mintRecipient decoded from padded bytes32
  const mintRecipientHex = decoded?.body?.mintRecipient as unknown as string | undefined;
  let recipient: string | null = null;
  if (hookData?.isValid && hookData.recipient) {
    recipient = hookData.recipient;
  } else if (mintRecipientHex && destDomain !== undefined) {
    recipient = decodeAddress(mintRecipientHex, destDomain);
  }

  // Amount received = amount - feeExecuted
  const amount = decoded?.body?.amount !== undefined ? BigInt(decoded.body.amount) : null;
  const feeExecuted = decoded?.body?.feeExecuted !== undefined ? BigInt(decoded.body.feeExecuted) : 0n;
  const amountReceived = amount !== null ? amount - feeExecuted : null;

  // Destination caller: all zeros = open relay
  const destCallerHex = decoded?.header?.destinationCaller as unknown as string | undefined;
  const isOpenRelay = destCallerHex
    ? /^(0x)?0+$/.test(destCallerHex)
    : undefined;

  // Nonce
  const nonce = decoded?.header?.nonce as unknown as string | undefined;

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "var(--sds-clr-gray-12)" }}>
          3. Mint USDC on Destination Chain
        </h3>
        {isMinted && (
          <Badge variant="success">Minted</Badge>
        )}
        {relay.checked && !relay.nonceUsed && (
          <Badge variant="warning">Awaiting relay</Badge>
        )}
        {!relay.checked && isComplete && (
          <Badge variant="secondary">Unverified</Badge>
        )}
        {!isComplete && (
          <Badge variant="secondary">Pending attestation</Badge>
        )}
      </div>

      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.5rem 1rem", margin: 0, fontSize: "0.875rem" }}>
        <dt style={{ color: "var(--sds-clr-gray-09)" }}>Destination</dt>
        <dd style={{ margin: 0 }}>
          {destDomain !== undefined ? domainName(destDomain) : "—"}
        </dd>

        {recipient && (
          <>
            <dt style={{ color: "var(--sds-clr-gray-09)" }}>Recipient</dt>
            <dd style={{ margin: 0 }}>
              <CopyText textToCopy={recipient} variant="ellipsis">
                {recipient}
              </CopyText>
            </dd>
          </>
        )}

        {amountReceived !== null && (
          <>
            <dt style={{ color: "var(--sds-clr-gray-09)" }}>Amount received</dt>
            <dd style={{ margin: 0, fontWeight: 500 }}>{formatUsdc(amountReceived, CCTP_USDC_DECIMALS)} USDC</dd>
          </>
        )}

        <dt style={{ color: "var(--sds-clr-gray-09)" }}>Status</dt>
        <dd style={{ margin: 0 }}>
          {isMinted
            ? "USDC minted on destination"
            : relay.checked && !relay.nonceUsed
              ? "Attested — awaiting relay"
              : !isComplete
                ? "Waiting for attestation to complete"
                : "Relay verification not available for this chain"}
        </dd>

        {relay.relayTxHash && (
          <>
            <dt style={{ color: "var(--sds-clr-gray-09)" }}>Relay tx</dt>
            <dd style={{ margin: 0 }}>
              <CopyText textToCopy={relay.relayTxHash} variant="ellipsis">
                {truncateHash(relay.relayTxHash, 20)}
              </CopyText>
            </dd>
          </>
        )}

        {isOpenRelay !== undefined && (
          <>
            <dt style={{ color: "var(--sds-clr-gray-09)" }}>Relay permission</dt>
            <dd style={{ margin: 0 }}>{isOpenRelay ? "Open (anyone can relay)" : "Restricted"}</dd>
          </>
        )}

        {nonce && (
          <>
            <dt style={{ color: "var(--sds-clr-gray-09)" }}>Nonce</dt>
            <dd style={{ margin: 0 }}>
              <CopyText textToCopy={nonce} variant="ellipsis">
                {nonce}
              </CopyText>
            </dd>
          </>
        )}
      </dl>

      {isComplete && attestation.message && attestation.attestation && (
        <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.25rem" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--sds-clr-gray-09)" }}>Message bytes</span>
              <CopyText textToCopy={attestation.message} variant="inline">
                <button type="button" style={{ fontSize: "0.75rem", color: "var(--sds-clr-lilac-09)", cursor: "pointer", background: "none", border: "none", padding: 0 }}>Copy</button>
              </CopyText>
            </div>
            <pre className="mono" style={{
              margin: 0, padding: "0.5rem", fontSize: "0.75rem",
              background: "var(--sds-clr-gray-03)", borderRadius: "0.25rem",
              overflowX: "auto", wordBreak: "break-all", whiteSpace: "pre-wrap",
            }}>
              {attestation.message}
            </pre>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.25rem" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--sds-clr-gray-09)" }}>Attestation</span>
              <CopyText textToCopy={attestation.attestation} variant="inline">
                <button type="button" style={{ fontSize: "0.75rem", color: "var(--sds-clr-lilac-09)", cursor: "pointer", background: "none", border: "none", padding: 0 }}>Copy</button>
              </CopyText>
            </div>
            <pre className="mono" style={{
              margin: 0, padding: "0.5rem", fontSize: "0.75rem",
              background: "var(--sds-clr-gray-03)", borderRadius: "0.25rem",
              overflowX: "auto", wordBreak: "break-all", whiteSpace: "pre-wrap",
            }}>
              {attestation.attestation}
            </pre>
          </div>
          {destChainSlug && relay.relayTxHash && (
            <a
              href={explorerTxUrl(config, destChainSlug, relay.relayTxHash)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "block", fontSize: "0.875rem", color: "var(--sds-clr-lilac-09)" }}
            >
              View relay tx on {destDomain !== undefined ? domainName(destDomain) : ""} explorer ↗
            </a>
          )}
          {destChainSlug && !relay.relayTxHash && relay.checked && !relay.nonceUsed && (
            <span style={{ display: "block", fontSize: "0.875rem", color: "var(--sds-clr-gray-09)" }}>
              Relay transaction not yet available on {destDomain !== undefined ? domainName(destDomain) : "destination"}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}
