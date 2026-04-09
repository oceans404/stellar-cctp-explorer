"use client";

import { useState, useMemo, useCallback } from "react";
import { Card, Badge, CopyText, Alert } from "@stellar/design-system";
import { parseCctpMessage, decodeAddress, bytesToHex, cctpVersionLabel, computeMessageHash } from "@/lib/parse-message";
import { computeNonceHash } from "@/lib/nonce-hash";
import { decodeHookData } from "@/lib/decode-hook";
import { fetchMessageByNonce } from "@/lib/iris-client";
import { useNetwork } from "@/context/network";
import { domainName, CCTP_USDC_DECIMALS, STELLAR_USDC_DECIMALS } from "@/lib/config";
import { formatUsdc } from "@/lib/utils";
import type { ParsedCctpMessage, HookData, NonceLookupResult } from "@/lib/types";

const EXAMPLE_PLACEHOLDER =
  "Paste a raw CCTP message hex here (with or without 0x prefix)…";

function byteCount(hex: string): number {
  const clean = hex.replace(/^0x/i, "").replace(/\s/g, "");
  if (clean.length === 0) return 0;
  return Math.floor(clean.length / 2);
}

interface DecodeResult {
  parsed: ParsedCctpMessage;
  hookData: HookData | null;
}

function tryDecode(hex: string): { result: DecodeResult | null; error: string | null } {
  const trimmed = hex.trim();
  if (!trimmed) return { result: null, error: null };

  try {
    const parsed = parseCctpMessage(trimmed);
    let hookData: HookData | null = null;
    if (parsed.body && parsed.body.hookData.length > 0) {
      hookData = decodeHookData(parsed.body.hookData);
    }
    return { result: { parsed, hookData }, error: null };
  } catch (e) {
    return { result: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export function MessageDecoder() {
  const [hex, setHex] = useState("");
  const { config, network } = useNetwork();

  const bytes = useMemo(() => byteCount(hex), [hex]);
  const { result, error } = useMemo(() => tryDecode(hex), [hex]);

  const messageHash = useMemo(
    () => (result ? computeMessageHash(result.parsed.rawBytes) : null),
    [result],
  );

  const nonceHash = useMemo(
    () =>
      result
        ? computeNonceHash(result.parsed.header.sourceDomain, result.parsed.header.nonce)
        : null,
    [result],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Input */}
      <Card>
        <h3 style={{ margin: "0 0 0.75rem", fontSize: "1rem", fontWeight: 600, color: "var(--sds-clr-gray-12)" }}>
          Message Hex
        </h3>
        <textarea
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          placeholder={EXAMPLE_PLACEHOLDER}
          spellCheck={false}
          style={{
            width: "100%",
            minHeight: "8rem",
            padding: "0.75rem",
            fontFamily: "var(--font-inconsolata), monospace",
            fontSize: "0.8125rem",
            lineHeight: 1.5,
            color: "var(--sds-clr-gray-12)",
            background: "var(--sds-clr-gray-02)",
            border: "1px solid var(--sds-clr-gray-06)",
            borderRadius: "0.375rem",
            resize: "vertical",
            wordBreak: "break-all",
          }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--sds-clr-gray-09)" }}>
          <span>{bytes > 0 ? `${bytes} bytes` : "No input"}</span>
          {bytes > 0 && <span>V2 header requires 148 bytes minimum</span>}
        </div>
      </Card>

      {/* Error */}
      {error && (
        <Alert variant="error" placement="inline">
          {error}
        </Alert>
      )}

      {/* Empty state */}
      {!hex.trim() && (
        <Card>
          <p style={{ margin: 0, color: "var(--sds-clr-gray-09)", fontSize: "0.875rem" }}>
            Paste a CCTP message hex above to decode it. You can find the message hex in the
            attestation response from Circle&apos;s Iris API, or from on-chain event logs
            (MessageSent events).
          </p>
        </Card>
      )}

      {/* Decoded output */}
      {result && (
        <>
          <HeaderSection header={result.parsed.header} />
          {result.parsed.body && (
            <BodySection body={result.parsed.body} header={result.parsed.header} />
          )}
          {result.hookData && <HookDataSection hookData={result.hookData} />}
          <AttestationLookupSection
            messageHash={messageHash!}
            nonceHash={nonceHash!}
            nonceHex={bytesToHex(result.parsed.header.nonce)}
            sourceDomain={result.parsed.header.sourceDomain}
            config={config}
            network={network}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header section
// ---------------------------------------------------------------------------

function HeaderSection({ header }: { header: ParsedCctpMessage["header"] }) {
  const nonceHex = bytesToHex(header.nonce);
  const senderDecoded = decodeAddress(header.sender, header.sourceDomain);
  const recipientDecoded = decodeAddress(header.recipient, header.destinationDomain);
  const destCallerDecoded = decodeAddress(header.destinationCaller, header.destinationDomain);
  const destCallerIsZero = header.destinationCaller.every((b) => b === 0);

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "var(--sds-clr-gray-12)" }}>
          Message Header
        </h3>
        <Badge variant="secondary" size="sm">
          {cctpVersionLabel(header.version)}
        </Badge>
      </div>

      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.5rem 1rem", margin: 0, fontSize: "0.875rem" }}>
        <dt style={{ color: "var(--sds-clr-gray-09)" }}>Version</dt>
        <dd style={{ margin: 0 }}>{cctpVersionLabel(header.version)}</dd>

        <dt style={{ color: "var(--sds-clr-gray-09)" }}>Source Domain</dt>
        <dd style={{ margin: 0 }}>
          {header.sourceDomain} — {domainName(header.sourceDomain)}
        </dd>

        <dt style={{ color: "var(--sds-clr-gray-09)" }}>Destination Domain</dt>
        <dd style={{ margin: 0 }}>
          {header.destinationDomain} — {domainName(header.destinationDomain)}
        </dd>

        <dt style={{ color: "var(--sds-clr-gray-09)" }}>Nonce</dt>
        <dd style={{ margin: 0, wordBreak: "break-all" }}>
          <CopyText textToCopy={nonceHex}>
            <span className="mono">{nonceHex}</span>
          </CopyText>
        </dd>

        <dt style={{ color: "var(--sds-clr-gray-09)" }}>Sender</dt>
        <dd style={{ margin: 0, wordBreak: "break-all" }}>
          <CopyText textToCopy={senderDecoded}>
            <span className="mono">{senderDecoded}</span>
          </CopyText>
        </dd>

        <dt style={{ color: "var(--sds-clr-gray-09)" }}>Recipient</dt>
        <dd style={{ margin: 0, wordBreak: "break-all" }}>
          <CopyText textToCopy={recipientDecoded}>
            <span className="mono">{recipientDecoded}</span>
          </CopyText>
        </dd>

        <dt style={{ color: "var(--sds-clr-gray-09)" }}>Destination Caller</dt>
        <dd style={{ margin: 0, wordBreak: "break-all" }}>
          {destCallerIsZero ? (
            <span style={{ color: "var(--sds-clr-gray-09)" }}>Any (no restriction)</span>
          ) : (
            <CopyText textToCopy={destCallerDecoded}>
              <span className="mono">{destCallerDecoded}</span>
            </CopyText>
          )}
        </dd>

        <dt style={{ color: "var(--sds-clr-gray-09)" }}>Min Finality Threshold</dt>
        <dd style={{ margin: 0 }}>{header.minFinalityThreshold.toLocaleString()}</dd>

        <dt style={{ color: "var(--sds-clr-gray-09)" }}>Finality Threshold Executed</dt>
        <dd style={{ margin: 0 }}>{header.finalityThresholdExecuted.toLocaleString()}</dd>
      </dl>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Body section
// ---------------------------------------------------------------------------

function BodySection({
  body,
  header,
}: {
  body: NonNullable<ParsedCctpMessage["body"]>;
  header: ParsedCctpMessage["header"];
}) {
  const burnTokenHex = bytesToHex(body.burnToken);
  const mintRecipientDecoded = decodeAddress(body.mintRecipient, header.destinationDomain);
  // messageSender is the user's account (ed25519 G...), not a contract
  const messageSenderDecoded = decodeAddress(body.messageSender, header.sourceDomain, true);
  const burnTokenDecoded = decodeAddress(body.burnToken, header.sourceDomain);

  const isStellarInvolved = header.sourceDomain === 27 || header.destinationDomain === 27;

  const amountCctp = formatUsdc(body.amount, CCTP_USDC_DECIMALS);
  const amountStellar = isStellarInvolved ? formatUsdc(body.amount * 10n, STELLAR_USDC_DECIMALS) : null;

  const maxFee = body.maxFee;
  const feeExecuted = body.feeExecuted;
  const expirationBlock = body.expirationBlock;

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "var(--sds-clr-gray-12)" }}>
          Burn Message Body
        </h3>
        <Badge variant="secondary" size="sm">
          {cctpVersionLabel(body.version)}
        </Badge>
      </div>

      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.5rem 1rem", margin: 0, fontSize: "0.875rem" }}>
        <dt style={{ color: "var(--sds-clr-gray-09)" }}>Body Version</dt>
        <dd style={{ margin: 0 }}>{cctpVersionLabel(body.version)}</dd>

        <dt style={{ color: "var(--sds-clr-gray-09)" }}>Burn Token</dt>
        <dd style={{ margin: 0, wordBreak: "break-all" }}>
          <CopyText textToCopy={burnTokenDecoded}>
            <span className="mono">{burnTokenDecoded}</span>
          </CopyText>
          {burnTokenDecoded !== burnTokenHex && (
            <span style={{ display: "block", fontSize: "0.75rem", color: "var(--sds-clr-gray-09)" }} className="mono">
              {burnTokenHex}
            </span>
          )}
        </dd>

        <dt style={{ color: "var(--sds-clr-gray-09)" }}>Mint Recipient</dt>
        <dd style={{ margin: 0, wordBreak: "break-all" }}>
          <CopyText textToCopy={mintRecipientDecoded}>
            <span className="mono">{mintRecipientDecoded}</span>
          </CopyText>
        </dd>

        <dt style={{ color: "var(--sds-clr-gray-09)" }}>Amount</dt>
        <dd style={{ margin: 0 }}>
          <span style={{ fontWeight: 500 }}>{amountCctp} USDC</span>
          <span style={{ display: "block", fontSize: "0.75rem", color: "var(--sds-clr-gray-09)" }}>
            Raw: {body.amount.toLocaleString()} (6-decimal)
            {amountStellar && <> · {amountStellar} USDC (7-decimal Stellar)</>}
          </span>
        </dd>

        <dt style={{ color: "var(--sds-clr-gray-09)" }}>Message Sender</dt>
        <dd style={{ margin: 0, wordBreak: "break-all" }}>
          <CopyText textToCopy={messageSenderDecoded}>
            <span className="mono">{messageSenderDecoded}</span>
          </CopyText>
        </dd>

        <dt style={{ color: "var(--sds-clr-gray-09)" }}>Max Fee</dt>
        <dd style={{ margin: 0 }}>
          {maxFee > 0n ? `${formatUsdc(maxFee, CCTP_USDC_DECIMALS)} USDC` : "0 (no fee)"}
          {maxFee > 0n && (
            <span style={{ display: "block", fontSize: "0.75rem", color: "var(--sds-clr-gray-09)" }}>
              Raw: {maxFee.toLocaleString()}
            </span>
          )}
        </dd>

        <dt style={{ color: "var(--sds-clr-gray-09)" }}>Fee Executed</dt>
        <dd style={{ margin: 0 }}>
          {feeExecuted > 0n ? `${formatUsdc(feeExecuted, CCTP_USDC_DECIMALS)} USDC` : "0"}
          {feeExecuted > 0n && (
            <span style={{ display: "block", fontSize: "0.75rem", color: "var(--sds-clr-gray-09)" }}>
              Raw: {feeExecuted.toLocaleString()}
            </span>
          )}
        </dd>

        <dt style={{ color: "var(--sds-clr-gray-09)" }}>Expiration Block</dt>
        <dd style={{ margin: 0 }}>
          {expirationBlock > 0n ? expirationBlock.toLocaleString() : "None (no expiry)"}
        </dd>
      </dl>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// HookData section
// ---------------------------------------------------------------------------

function HookDataSection({ hookData }: { hookData: HookData }) {
  const hasStructuredFields = hookData.version !== 0 || hookData.isSelfRelay;

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "var(--sds-clr-gray-12)" }}>
          Hook Data
        </h3>
        <Badge variant={hookData.isValid ? "success" : "error"} size="sm">
          {hookData.isValid ? "Valid" : "Invalid"}
        </Badge>
      </div>

      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.5rem 1rem", margin: 0, fontSize: "0.875rem" }}>
        <dt style={{ color: "var(--sds-clr-gray-09)" }}>Recipient</dt>
        <dd style={{ margin: 0, wordBreak: "break-all" }}>
          {hookData.recipient ? (
            <CopyText textToCopy={hookData.recipient}>
              <span className="mono">{hookData.recipient}</span>
            </CopyText>
          ) : (
            <span style={{ color: "var(--sds-clr-gray-09)" }}>—</span>
          )}
        </dd>

        <dt style={{ color: "var(--sds-clr-gray-09)" }}>Recipient Type</dt>
        <dd style={{ margin: 0 }}>{hookData.recipientType}</dd>

        {hasStructuredFields && (
          <>
            <dt style={{ color: "var(--sds-clr-gray-09)" }}>Self-relay</dt>
            <dd style={{ margin: 0 }}>
              <Badge variant={hookData.isSelfRelay ? "warning" : "secondary"} size="sm">
                {hookData.isSelfRelay ? "Yes" : "No"}
              </Badge>
            </dd>

            <dt style={{ color: "var(--sds-clr-gray-09)" }}>Version</dt>
            <dd style={{ margin: 0 }}>{hookData.version}</dd>
          </>
        )}
      </dl>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Attestation lookup section
// ---------------------------------------------------------------------------

function AttestationLookupSection({
  messageHash,
  nonceHash,
  nonceHex,
  sourceDomain,
  config,
  network,
}: {
  messageHash: string;
  nonceHash: string;
  nonceHex: string;
  sourceDomain: number;
  config: import("@/lib/types").NetworkConfig;
  network: import("@/lib/types").NetworkName;
}) {
  const [loading, setLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<NonceLookupResult | null>(null);

  const handleLookup = useCallback(async () => {
    setLoading(true);
    setLookupResult(null);
    try {
      const result = await fetchMessageByNonce(config, sourceDomain, nonceHex);
      setLookupResult(result);
    } finally {
      setLoading(false);
    }
  }, [config, sourceDomain, nonceHex]);

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "var(--sds-clr-gray-12)" }}>
          Attestation Lookup
        </h3>
        <Badge variant="secondary" size="sm">
          {network}
        </Badge>
      </div>

      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.5rem 1rem", margin: 0, fontSize: "0.875rem" }}>
        <dt style={{ color: "var(--sds-clr-gray-09)" }}>Message Hash</dt>
        <dd style={{ margin: 0, wordBreak: "break-all" }}>
          <CopyText textToCopy={messageHash}>
            <span className="mono">{messageHash}</span>
          </CopyText>
          <span style={{ display: "block", fontSize: "0.75rem", color: "var(--sds-clr-gray-09)" }}>
            keccak256 of the raw message bytes
          </span>
        </dd>

        <dt style={{ color: "var(--sds-clr-gray-09)" }}>Nonce Hash</dt>
        <dd style={{ margin: 0, wordBreak: "break-all" }}>
          <CopyText textToCopy={nonceHash}>
            <span className="mono">{nonceHash}</span>
          </CopyText>
          <span style={{ display: "block", fontSize: "0.75rem", color: "var(--sds-clr-gray-09)" }}>
            keccak256(sourceDomain, nonce) — used to check relay status on destination
          </span>
        </dd>
      </dl>

      <div style={{ marginTop: "1rem" }}>
        <button
          onClick={handleLookup}
          disabled={loading}
          style={{
            padding: "0.5rem 1rem",
            fontSize: "0.8125rem",
            fontWeight: 500,
            color: "var(--sds-clr-gray-01)",
            background: "var(--sds-clr-gray-12)",
            border: "none",
            borderRadius: "0.375rem",
            cursor: loading ? "wait" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Looking up..." : "Look up on Iris"}
        </button>
      </div>

      {lookupResult && (
        <div style={{ marginTop: "1rem" }}>
          {!lookupResult.found && (
            <Alert variant="warning" placement="inline">
              {lookupResult.detail ?? "Not found on Iris"}
            </Alert>
          )}

          {lookupResult.found && (
            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.5rem 1rem", margin: 0, fontSize: "0.875rem" }}>
              <dt style={{ color: "var(--sds-clr-gray-09)" }}>Status</dt>
              <dd style={{ margin: 0 }}>
                <Badge
                  variant={lookupResult.status === "complete" ? "success" : "warning"}
                  size="sm"
                >
                  {lookupResult.status === "complete" ? "Attested" : "Pending"}
                </Badge>
              </dd>

              {lookupResult.cctpVersion !== undefined && (
                <>
                  <dt style={{ color: "var(--sds-clr-gray-09)" }}>CCTP Version</dt>
                  <dd style={{ margin: 0 }}>V{lookupResult.cctpVersion}</dd>
                </>
              )}

              {lookupResult.attestation && (
                <>
                  <dt style={{ color: "var(--sds-clr-gray-09)" }}>Attestation</dt>
                  <dd style={{ margin: 0, wordBreak: "break-all" }}>
                    <CopyText textToCopy={lookupResult.attestation}>
                      <span className="mono" style={{ fontSize: "0.75rem" }}>{lookupResult.attestation}</span>
                    </CopyText>
                  </dd>
                </>
              )}
            </dl>
          )}
        </div>
      )}
    </Card>
  );
}
