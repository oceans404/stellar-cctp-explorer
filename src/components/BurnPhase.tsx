"use client";

import { StrKey } from "@stellar/stellar-sdk";
import { Card, Badge, CopyText } from "@stellar/design-system";
import type { SourceTxInfo, ParsedCctpMessage, NetworkConfig } from "@/lib/types";
import { domainName, domainToChainSlug, explorerTxUrl, CCTP_USDC_DECIMALS, MIN_FINALITY_THRESHOLD } from "@/lib/config";
import { formatUsdc, truncateHash } from "@/lib/utils";

/** Decode a bytes32 hex string to a readable address */
function decodeAddress(hex: string, domain?: number): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = Uint8Array.from(clean.match(/.{2}/g)!.map((b) => parseInt(b, 16)));

  // Stellar: try Ed25519 then Contract strkey
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

  // EVM: 12 zero bytes + 20-byte address
  if (domain !== 27 && /^0{24}[0-9a-fA-F]{40}$/.test(clean)) {
    return "0x" + clean.slice(24);
  }

  return "0x" + clean;
}

interface BurnPhaseProps {
  sourceTx: SourceTxInfo;
  decoded: ParsedCctpMessage | null;
  attestation: { amount?: string; sourceDomain?: number; destDomain?: number };
  chainSlug: string;
  txHash: string;
  config: NetworkConfig;
}

export function BurnPhase({ sourceTx, decoded, attestation, chainSlug, txHash, config }: BurnPhaseProps) {
  const isRelay = sourceTx.isRelay === true;
  const hasBurnTx = isRelay && !!sourceTx.burnTxHash;
  const srcDomain = decoded?.header.sourceDomain ?? attestation.sourceDomain;
  const dstDomain = decoded?.header.destinationDomain ?? attestation.destDomain;
  const isStellarInvolved = srcDomain === 27 || dstDomain === 27;

  // For relay entries where we found the burn tx, build the explorer link
  const burnChainSlug = hasBurnTx && srcDomain !== undefined ? domainToChainSlug(config, srcDomain) : null;
  const burnExplorerUrl = burnChainSlug ? explorerTxUrl(config, burnChainSlug, sourceTx.burnTxHash!) : "";

  // Amount display
  let amountPrimary = attestation.amount ? `${attestation.amount} USDC` : "—";
  let amountSecondary: string | null = null;

  if (decoded?.body?.amount !== undefined && isStellarInvolved) {
    const rawAmount = BigInt(decoded.body.amount);
    const cctpFormatted = formatUsdc(rawAmount, CCTP_USDC_DECIMALS);
    amountPrimary = `${cctpFormatted} USDC`;
    const stellarRaw = rawAmount * 10n;
    amountSecondary = `(${rawAmount.toLocaleString()} CCTP / ${stellarRaw.toLocaleString()} Stellar)`;
  }

  // Fee fields from decoded body (come as strings from JSON)
  const maxFee = decoded?.body?.maxFee !== undefined ? BigInt(decoded.body.maxFee) : 0n;
  const feeExecuted = decoded?.body?.feeExecuted !== undefined ? BigInt(decoded.body.feeExecuted) : 0n;
  const expirationBlock = decoded?.body?.expirationBlock !== undefined ? BigInt(decoded.body.expirationBlock) : 0n;

  // Speed tier
  const isFast =
    decoded?.header.minFinalityThreshold !== undefined &&
    decoded.header.minFinalityThreshold < MIN_FINALITY_THRESHOLD;

  // Explorer link — only for burn txs (not relay entry)
  const explorerUrl = isRelay ? "" : explorerTxUrl(config, chainSlug, txHash);

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "var(--sds-clr-gray-12)" }}>
          1. Burn USDC on Source Chain
        </h3>
        {isRelay ? (
          <Badge variant="success">Success</Badge>
        ) : sourceTx.found ? (
          <Badge variant={sourceTx.status === "Success" ? "success" : "error"}>
            {sourceTx.status ?? "Unknown"}
          </Badge>
        ) : null}
      </div>

      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.5rem 1rem", margin: 0, fontSize: "0.875rem" }}>
        <dt style={{ color: "var(--sds-clr-gray-09)" }}>Source chain</dt>
        <dd style={{ margin: 0 }}>{srcDomain !== undefined ? domainName(srcDomain) : chainSlug}</dd>

        {!isRelay && (
          <>
            <dt style={{ color: "var(--sds-clr-gray-09)" }}>Tx hash</dt>
            <dd style={{ margin: 0 }}>
              <CopyText textToCopy={txHash}>
                {explorerUrl ? (
                  <a href={explorerUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--sds-clr-lilac-09)" }}>
                    {truncateHash(txHash, 20)}
                  </a>
                ) : (
                  <span className="mono">{truncateHash(txHash, 20)}</span>
                )}
              </CopyText>
            </dd>
          </>
        )}

        {hasBurnTx && (
          <>
            <dt style={{ color: "var(--sds-clr-gray-09)" }}>Tx hash</dt>
            <dd style={{ margin: 0 }}>
              <CopyText textToCopy={sourceTx.burnTxHash!}>
                {burnExplorerUrl ? (
                  <a href={burnExplorerUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--sds-clr-lilac-09)" }}>
                    {truncateHash(sourceTx.burnTxHash!, 20)}
                  </a>
                ) : (
                  <span className="mono">{truncateHash(sourceTx.burnTxHash!, 20)}</span>
                )}
              </CopyText>
            </dd>
          </>
        )}

        <dt style={{ color: "var(--sds-clr-gray-09)" }}>Amount</dt>
        <dd style={{ margin: 0 }}>
          <span style={{ fontWeight: 500 }}>{amountPrimary}</span>
          {amountSecondary && (
            <span style={{ display: "block", fontSize: "0.75rem", color: "var(--sds-clr-gray-09)" }}>
              {amountSecondary}
            </span>
          )}
        </dd>

        <dt style={{ color: "var(--sds-clr-gray-09)" }}>Destination</dt>
        <dd style={{ margin: 0 }}>{dstDomain !== undefined ? domainName(dstDomain) : "—"}</dd>

        {decoded?.body?.mintRecipient && (
          <>
            <dt style={{ color: "var(--sds-clr-gray-09)" }}>Recipient</dt>
            <dd style={{ margin: 0 }}>
              <CopyText textToCopy={decodeAddress(decoded.body.mintRecipient as unknown as string, dstDomain)} variant="ellipsis">
                {decodeAddress(decoded.body.mintRecipient as unknown as string, dstDomain)}
              </CopyText>
            </dd>
          </>
        )}

        {decoded?.body?.messageSender && (
          <>
            <dt style={{ color: "var(--sds-clr-gray-09)" }}>Sender</dt>
            <dd style={{ margin: 0 }}>
              <CopyText textToCopy={decodeAddress(decoded.body.messageSender as unknown as string, srcDomain)} variant="ellipsis">
                {decodeAddress(decoded.body.messageSender as unknown as string, srcDomain)}
              </CopyText>
            </dd>
          </>
        )}

        <dt style={{ color: "var(--sds-clr-gray-09)" }}>Speed</dt>
        <dd style={{ margin: 0 }}>
          <Badge variant={isFast ? "warning" : "secondary"} size="sm">
            {isFast ? "Fast" : "Standard"}
          </Badge>
        </dd>

        {maxFee > 0n && (
          <>
            <dt style={{ color: "var(--sds-clr-gray-09)" }}>Max fee</dt>
            <dd style={{ margin: 0 }}>{formatUsdc(maxFee, CCTP_USDC_DECIMALS)} USDC</dd>
          </>
        )}

        {feeExecuted > 0n && (
          <>
            <dt style={{ color: "var(--sds-clr-gray-09)" }}>Fee executed</dt>
            <dd style={{ margin: 0 }}>{formatUsdc(feeExecuted, CCTP_USDC_DECIMALS)} USDC</dd>
          </>
        )}

        {expirationBlock > 0n && (
          <>
            <dt style={{ color: "var(--sds-clr-gray-09)" }}>Expiration block</dt>
            <dd style={{ margin: 0 }}>{expirationBlock.toString()}</dd>
          </>
        )}

        {!isRelay && sourceTx.block && (
          <>
            <dt style={{ color: "var(--sds-clr-gray-09)" }}>Block</dt>
            <dd style={{ margin: 0 }}>{sourceTx.block}</dd>
          </>
        )}

        {!isRelay && sourceTx.timestamp && (
          <>
            <dt style={{ color: "var(--sds-clr-gray-09)" }}>Timestamp</dt>
            <dd style={{ margin: 0 }}>{new Date(sourceTx.timestamp).toLocaleString()}</dd>
          </>
        )}
      </dl>

      {(explorerUrl || burnExplorerUrl) && (
        <a
          href={explorerUrl || burnExplorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "block", marginTop: "1rem", fontSize: "0.875rem", color: "var(--sds-clr-lilac-09)" }}
        >
          View on {srcDomain !== undefined ? domainName(srcDomain) : chainSlug} explorer ↗
        </a>
      )}
    </Card>
  );
}
