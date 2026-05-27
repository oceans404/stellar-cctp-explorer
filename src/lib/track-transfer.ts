import type { NetworkConfig, TransferStatus, SourceTxInfo, RelayInfo } from "./types";
import { fetchAttestation, fetchMessageByNonce } from "./iris-client";
import { getStellarTransaction, simulateIsNonceUsed, findStellarBurnTx } from "./soroban-client";
import { checkSolanaNonce, getSolanaTransaction, findSolanaBurnTx } from "./solana-client";
import { parseCctpMessage } from "./parse-message";
import { decodeHookData } from "./decode-hook";


// ---------------------------------------------------------------------------
// EVM burn tx reverse lookup (DepositForBurn event by depositor)
// ---------------------------------------------------------------------------

// DepositForBurn(address indexed burnToken, uint256 amount, address indexed depositor,
//   bytes32 mintRecipient, uint32 destinationDomain, bytes32 destinationTokenMessenger,
//   bytes32 destinationCaller, uint256 maxFee, uint32 indexed minFinalityThreshold, bytes hookData)
const DEPOSIT_FOR_BURN_TOPIC = "0x0c8c1cbdc5190613ebd485511d4e2812cfa45eecb79d845893331fedad5130a5";

/**
 * Search for the EVM burn tx by scanning DepositForBurn events from the
 * TokenMessengerV2 contract, filtered by the depositor address (indexed topic).
 * Match by amount + mintRecipient + destinationDomain from the event data
 * against the decoded CCTP message.
 */
async function findEvmBurnTx(
  rpcUrl: string,
  tokenMessenger: string,
  depositorAddress: string,
  destDomain: number,
  mintRecipient: Uint8Array,
  amount: bigint,
  burnSearchBlocks: number,
): Promise<string | undefined> {
  const depositorTopic = "0x000000000000000000000000" + depositorAddress.slice(2).toLowerCase();
  const targetRecipientHex = Array.from(mintRecipient).map((b) => b.toString(16).padStart(2, "0")).join("");

  try {
    // Get latest block
    const blockRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
    });
    const latestBlock = parseInt(((await blockRes.json()) as { result: string }).result, 16);

    // Window tuned per chain (~7 days of coverage). Chunked at 10k to respect
    // Alchemy's eth_getLogs cap. The indexed depositor topic keeps the search
    // efficient even over large ranges.
    const searchStart = Math.max(0, latestBlock - burnSearchBlocks);
    const CHUNK = 10000;

    for (let to = latestBlock; to > searchStart; to -= CHUNK) {
      const from = Math.max(searchStart, to - CHUNK + 1);
      const logsRes = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "eth_getLogs",
          params: [{
            address: tokenMessenger,
            topics: [DEPOSIT_FOR_BURN_TOPIC, null, depositorTopic],
            fromBlock: "0x" + from.toString(16),
            toBlock: "0x" + to.toString(16),
          }],
        }),
      });

      const logsJson = (await logsRes.json()) as { result?: Array<{ transactionHash: string; data: string }> };
      for (const log of logsJson.result ?? []) {
        // ABI decode non-indexed data: amount(32) + mintRecipient(32) + destDomain(32) + ...
        const data = log.data.startsWith("0x") ? log.data.slice(2) : log.data;
        if (data.length < 192) continue; // need at least 3 words

        const eventAmount = BigInt("0x" + data.slice(0, 64)); // word 0: amount
        const eventRecipient = data.slice(64, 128); // word 1: mintRecipient
        const eventDestDomain = parseInt(data.slice(128, 192), 16); // word 2: destinationDomain

        if (eventAmount === amount && eventDestDomain === destDomain && eventRecipient === targetRecipientHex) {
          return log.transactionHash;
        }
      }
    }
  } catch {
    // Log search failed — non-critical
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// EVM source tx lookup
// ---------------------------------------------------------------------------

async function fetchEvmSourceTx(rpcUrl: string, txHash: string): Promise<SourceTxInfo> {
  const hash = txHash.startsWith("0x") ? txHash : "0x" + txHash;
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getTransactionReceipt",
        params: [hash],
      }),
    });

    if (!res.ok) {
      return { found: false, detail: `EVM RPC HTTP ${res.status}` };
    }

    const json = (await res.json()) as { result?: Record<string, unknown> };
    const receipt = json.result;
    if (!receipt) {
      return { found: false, detail: "Transaction not found on chain" };
    }

    const blockNumber = parseInt(receipt.blockNumber as string, 16);
    const txStatus = receipt.status === "0x1" ? "Success" : "Reverted";

    const MESSAGE_SENT_TOPIC = "0x2c32d4ae151744d0bf0b9464a3e897a1d17ed2f1af71f7c9a75f12ce0d28238f";
    const logs = receipt.logs as Array<{ topics?: string[]; data?: string }> | undefined;
    const isBurn = logs?.some((log) => log.topics?.[0] === MESSAGE_SENT_TOPIC) ?? false;

    // Detect relay tx (MessageReceived event)
    const relayLog = logs?.find((log) => log.topics?.[0] === MESSAGE_RECEIVED_TOPIC);
    const isRelay = !isBurn && !!relayLog;
    let relaySourceDomain: number | undefined;
    let relayNonce: string | undefined;
    if (isRelay && relayLog?.topics && relayLog.data) {
      // topic[2] = nonce (bytes32)
      relayNonce = relayLog.topics[2];
      // data starts with sourceDomain (uint256, first 32-byte word)
      const dataHex = relayLog.data.startsWith("0x") ? relayLog.data.slice(2) : relayLog.data;
      if (dataHex.length >= 64) {
        relaySourceDomain = parseInt(dataHex.slice(0, 64), 16);
      }
    }

    // Fetch block timestamp
    let timestamp: string | undefined;
    let timestampMs: number | undefined;
    try {
      const blockRes = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "eth_getBlockByNumber",
          params: [receipt.blockNumber as string, false],
        }),
      });
      const blockJson = (await blockRes.json()) as { result?: { timestamp?: string } };
      if (blockJson.result?.timestamp) {
        timestampMs = parseInt(blockJson.result.timestamp, 16) * 1000;
        timestamp = new Date(timestampMs).toISOString();
      }
    } catch {
      // Timestamp fetch failed — non-critical, continue without it
    }

    return {
      found: true,
      block: blockNumber.toString(),
      timestamp,
      timestampMs,
      status: txStatus,
      isBurn,
      isRelay,
      relaySourceDomain,
      relayNonce,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { found: false, detail: message };
  }
}

// ---------------------------------------------------------------------------
// EVM nonce check
// ---------------------------------------------------------------------------

// MessageReceived event topic on MessageTransmitterV2
const MESSAGE_RECEIVED_TOPIC = "0xff48c13eda96b1cceacc6b9edeedc9e9db9d6226afbc30146b720c19d3addb1c";

async function checkEvmNonce(
  rpcUrl: string,
  messageTransmitter: string,
  _sourceDomain: number,
  nonce: Uint8Array,
  relaySearchBlocks: number,
): Promise<RelayInfo> {
  try {
    // V2: usedNonces(bytes32) takes the raw nonce directly (no hashing)
    const selector = "feb61724";
    const nonceHex = Array.from(nonce).map((b) => b.toString(16).padStart(2, "0")).join("");
    const calldata = "0x" + selector + nonceHex;

    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: messageTransmitter, data: calldata }, "latest"],
      }),
    });

    if (!res.ok) {
      return { checked: false, detail: `EVM RPC HTTP ${res.status}` };
    }

    const json = (await res.json()) as { result?: string };
    if (!json.result) {
      return { checked: false, detail: "No result from eth_call" };
    }

    const value = BigInt(json.result);
    const nonceUsed = value > 0n;

    // If nonce used, find the relay tx hash via event logs
    let relayTxHash: string | undefined;
    if (nonceUsed) {
      relayTxHash = await findEvmRelayTx(rpcUrl, messageTransmitter, "0x" + nonceHex, relaySearchBlocks);
    }

    return { checked: true, nonceUsed, relayTxHash };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { checked: false, detail: message };
  }
}

async function findEvmRelayTx(
  rpcUrl: string,
  messageTransmitter: string,
  nonce: string,
  relaySearchBlocks: number,
): Promise<string | undefined> {
  try {
    const blockRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
    });
    const latestBlock = parseInt(((await blockRes.json()) as { result: string }).result, 16);

    // Chunked at 10k blocks per request to respect Alchemy's eth_getLogs cap.
    // Newest-first so we return as soon as we find the relay.
    const searchStart = Math.max(0, latestBlock - relaySearchBlocks);
    const CHUNK = 10000;

    for (let to = latestBlock; to > searchStart; to -= CHUNK) {
      const from = Math.max(searchStart, to - CHUNK + 1);
      const logsRes = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "eth_getLogs",
          params: [{
            address: messageTransmitter,
            topics: [MESSAGE_RECEIVED_TOPIC, null, nonce],
            fromBlock: "0x" + from.toString(16),
            toBlock: "0x" + to.toString(16),
          }],
        }),
      });

      const logsJson = (await logsRes.json()) as { result?: Array<{ transactionHash: string }> };
      const hit = logsJson.result?.[0]?.transactionHash;
      if (hit) return hit;
    }
  } catch {
    // Log search failed — non-critical
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Transfer status orchestrator
// ---------------------------------------------------------------------------

export async function getTransferStatus(
  config: NetworkConfig,
  sourceDomain: number,
  txHash: string
): Promise<TransferStatus> {
  // Phase 1: Source tx
  let sourceTx: SourceTxInfo;
  const sourceChain = Object.values(config.chains).find((c) => c.domain === sourceDomain);

  if (sourceChain?.type === "stellar") {
    sourceTx = await getStellarTransaction(config, txHash);
  } else if (sourceChain?.type === "evm") {
    sourceTx = await fetchEvmSourceTx(sourceChain.rpcUrl, txHash);
  } else if (sourceChain?.type === "solana") {
    sourceTx = await getSolanaTransaction(sourceChain.rpcUrl, sourceChain.messageTransmitter, txHash);
  } else {
    sourceTx = { found: false, detail: `No RPC configured for domain ${sourceDomain}` };
  }

  // ---------------------------------------------------------------------------
  // Relay tx detected — resolve from the destination side
  // ---------------------------------------------------------------------------
  if (sourceTx.isRelay && sourceTx.relaySourceDomain !== undefined && sourceTx.relayNonce) {
    return resolveFromRelay(config, sourceTx, txHash);
  }

  // Phase 2: Attestation
  const attestation = await fetchAttestation(config, sourceDomain, txHash);

  // Decode CCTP message if available
  let decoded = null;
  let hookDataDecoded = null;
  let destDomain = attestation.destDomain;
  let nonce: Uint8Array | undefined;

  if (attestation.message) {
    try {
      decoded = parseCctpMessage(attestation.message);
      nonce = decoded.header.nonce;
      if (destDomain === undefined) {
        destDomain = decoded.header.destinationDomain;
        attestation.destDomain = destDomain;
      }
      if (decoded.body?.hookData && decoded.body.hookData.length >= 32) {
        hookDataDecoded = decodeHookData(decoded.body.hookData);
      }
    } catch {
      // Message decode failed — continue without it
    }
  }

  // Phase 3: Destination nonce check
  let relay: RelayInfo = { checked: false };

  if (attestation.found && attestation.status === "complete" && destDomain !== undefined && nonce !== undefined) {
    const destChain = Object.values(config.chains).find((c) => c.domain === destDomain);

    if (destChain?.type === "evm" && "messageTransmitterV2" in destChain) {
      relay = await checkEvmNonce(destChain.rpcUrl, destChain.messageTransmitterV2, sourceDomain, nonce, destChain.relaySearchBlocks);
    } else if (destChain?.type === "stellar") {
      const nonceHex = ("0x" + Array.from(nonce).map((b) => b.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
      relay = await simulateIsNonceUsed(config, nonceHex, nonce);
    } else if (destChain?.type === "solana" && destChain.messageTransmitter) {
      relay = await checkSolanaNonce(destChain.rpcUrl, destChain.messageTransmitter, nonce);
    } else {
      relay = { checked: false, detail: `No nonce check for domain ${destDomain}` };
    }
  }

  return {
    sourceTx,
    attestation,
    relay,
    decoded,
    hookData: hookDataDecoded,
  };
}

// ---------------------------------------------------------------------------
// Resolve transfer from a relay (destination) tx
// ---------------------------------------------------------------------------

async function resolveFromRelay(
  config: NetworkConfig,
  relayTx: SourceTxInfo,
  relayTxHash: string,
): Promise<TransferStatus> {
  const actualSourceDomain = relayTx.relaySourceDomain!;
  const nonce = relayTx.relayNonce!;

  // Query Iris by nonce to get the attestation + message
  const irisResult = await fetchMessageByNonce(config, actualSourceDomain, nonce);

  // Build attestation info from nonce lookup
  const attestation = irisResult.found
    ? {
        found: true as const,
        status: irisResult.status === "complete" ? "complete" as const : "pending" as const,
        attestation: irisResult.attestation,
        message: irisResult.message,
        sourceDomain: actualSourceDomain,
        cctpVersion: irisResult.cctpVersion,
      }
    : { found: false as const, detail: irisResult.detail };

  // Decode the CCTP message if Iris returned it
  let decoded = null;
  let hookDataDecoded = null;

  if (irisResult.message) {
    try {
      decoded = parseCctpMessage(irisResult.message);
      if (decoded.body?.hookData && decoded.body.hookData.length >= 32) {
        hookDataDecoded = decodeHookData(decoded.body.hookData);
      }
      // Populate dest domain on attestation from decoded message
      if (attestation.found) {
        (attestation as { destDomain?: number }).destDomain = decoded.header.destinationDomain;
      }
    } catch { /* decode failed — continue */ }
  }

  // The relay is confirmed — the user gave us the relay tx.
  // Keep the hash as-is; explorerTxUrl handles formatting per chain type.
  const relay = {
    checked: true,
    nonceUsed: true,
    relayTxHash: relayTxHash,
  };

  // Try to find the original burn tx on the source chain (best-effort).
  let burnTxHash: string | undefined;
  const sourceChain = Object.values(config.chains).find((c) => c.domain === actualSourceDomain);

  if (sourceChain?.type === "stellar" && decoded) {
    try {
      // Decode messageSender (bytes32) to a Stellar G... address for Horizon fallback
      let senderAddress: string | undefined;
      if (decoded.body?.messageSender) {
        try {
          const { StrKey } = await import("@stellar/stellar-sdk");
          const addr = StrKey.encodeEd25519PublicKey(
            Buffer.from(decoded.body.messageSender) as unknown as Buffer,
          );
          if (StrKey.isValidEd25519PublicKey(addr)) {
            senderAddress = addr;
          }
        } catch { /* ignore decode failure */ }
      }
      // Pass the full CCTP message for matching (Stellar emits nonce as zeros
      // in the on-chain event, so we compare the rest of the message instead)
      burnTxHash = await findStellarBurnTx(config, decoded.rawBytes, senderAddress);
    } catch {
      // Non-critical — burn tx lookup is best-effort
    }
  } else if (sourceChain?.type === "evm" && "tokenMessengerV2" in sourceChain && decoded?.body) {
    try {
      // Extract the 20-byte EVM depositor address from the 32-byte messageSender
      const senderHex = Array.from(decoded.body.messageSender).map((b) => b.toString(16).padStart(2, "0")).join("");
      const evmAddress = "0x" + senderHex.slice(24); // last 20 bytes
      burnTxHash = await findEvmBurnTx(
        sourceChain.rpcUrl,
        sourceChain.tokenMessengerV2,
        evmAddress,
        decoded.header.destinationDomain,
        decoded.body.mintRecipient,
        decoded.body.amount,
        sourceChain.burnSearchBlocks,
      );
    } catch {
      // Non-critical — burn tx lookup is best-effort
    }
  } else if (sourceChain?.type === "solana" && decoded?.body) {
    try {
      // Solana messageSender is the 32-byte wallet pubkey → base58
      const { default: bs58 } = await import("bs58");
      const senderWallet = bs58.encode(Buffer.from(decoded.body.messageSender));
      burnTxHash = await findSolanaBurnTx(
        sourceChain.rpcUrl,
        senderWallet,
        decoded.header.destinationDomain,
        decoded.body.mintRecipient,
      );
    } catch {
      // Non-critical — burn tx lookup is best-effort
    }
  }

  // Re-package sourceTx: mark it as a relay entry point with the actual source domain
  const sourceTx: SourceTxInfo = {
    ...relayTx,
    isBurn: false,
    isRelay: true,
    burnTxHash,
  };

  return { sourceTx, attestation, relay, decoded, hookData: hookDataDecoded };
}
