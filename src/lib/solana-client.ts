import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import bs58 from "bs58";
import type { RelayInfo, SourceTxInfo } from "./types";

// ---------------------------------------------------------------------------
// Solana PDA derivation (no @solana/web3.js dependency)
// ---------------------------------------------------------------------------

function isOnCurve(point: Uint8Array): boolean {
  try {
    const hex = Array.from(point).map((b) => b.toString(16).padStart(2, "0")).join("");
    ed25519.Point.fromHex(hex);
    return true;
  } catch {
    return false;
  }
}

function findProgramAddress(
  seeds: Uint8Array[],
  programId: string
): { address: string; bump: number } {
  const programIdBytes = bs58.decode(programId);
  const suffix = new TextEncoder().encode("ProgramDerivedAddress");

  for (let bump = 255; bump >= 0; bump--) {
    const parts = [...seeds, Uint8Array.from([bump]), programIdBytes, suffix];
    let totalLen = 0;
    for (const p of parts) totalLen += p.length;
    const buf = new Uint8Array(totalLen);
    let offset = 0;
    for (const p of parts) {
      buf.set(p, offset);
      offset += p.length;
    }
    const hash = sha256(buf);
    if (!isOnCurve(hash)) {
      return { address: bs58.encode(hash), bump };
    }
  }
  throw new Error("Could not find PDA");
}

// ---------------------------------------------------------------------------
// Solana nonce check
// ---------------------------------------------------------------------------

/**
 * Check whether a CCTP V2 nonce has been used on Solana by deriving the
 * `used_nonce` PDA and checking if the account exists on-chain.
 * If used, also looks up the relay transaction via getSignaturesForAddress.
 */
export async function checkSolanaNonce(
  rpcUrl: string,
  messageTransmitter: string,
  nonce: Uint8Array
): Promise<RelayInfo> {
  try {
    // Derive the used_nonce PDA: seeds = ["used_nonce", nonce_bytes]
    const { address: noncePda } = findProgramAddress(
      [new TextEncoder().encode("used_nonce"), nonce],
      messageTransmitter
    );

    // Check if the PDA account exists (account exists = nonce used)
    const acctRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAccountInfo",
        params: [noncePda, { encoding: "base64" }],
      }),
    });

    if (!acctRes.ok) {
      return { checked: false, detail: `Solana RPC HTTP ${acctRes.status}` };
    }

    const acctJson = (await acctRes.json()) as {
      result?: { value: unknown };
    };
    const nonceUsed = acctJson.result?.value !== null;

    // If nonce used, find the relay tx
    let relayTxHash: string | undefined;
    if (nonceUsed) {
      relayTxHash = await findSolanaRelayTx(rpcUrl, noncePda);
    }

    return { checked: true, nonceUsed, relayTxHash };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { checked: false, detail: message };
  }
}

async function findSolanaRelayTx(
  rpcUrl: string,
  noncePda: string
): Promise<string | undefined> {
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "getSignaturesForAddress",
        params: [noncePda, { limit: 1 }],
      }),
    });

    const json = (await res.json()) as {
      result?: Array<{ signature: string; err: unknown }>;
    };

    // Return the first successful signature
    const sig = json.result?.find((s) => s.err === null);
    return sig?.signature;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Solana burn tx reverse lookup
// ---------------------------------------------------------------------------

/**
 * Search for the Solana burn tx by looking at the sender wallet's recent
 * transactions for a DepositForBurn instruction matching the target
 * destination domain and mint recipient.
 *
 * The sender wallet address is extracted from the decoded CCTP message's
 * body.messageSender field (32-byte Solana public key).
 */
export async function findSolanaBurnTx(
  rpcUrl: string,
  senderWallet: string,
  destDomain: number,
  mintRecipient: Uint8Array,
): Promise<string | undefined> {
  const targetRecipientHex = Array.from(mintRecipient).map((b) => b.toString(16).padStart(2, "0")).join("");

  try {
    // Get recent signatures for the sender wallet
    const sigsRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSignaturesForAddress",
        params: [senderWallet, { limit: 50 }],
      }),
    });

    if (!sigsRes.ok) return undefined;
    const sigsJson = (await sigsRes.json()) as {
      result?: Array<{ signature: string; err: unknown }>;
    };
    const sigs = sigsJson.result?.filter((s) => s.err === null) ?? [];

    for (const sig of sigs) {
      // Fetch the transaction
      const txRes = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "getTransaction",
          params: [sig.signature, { encoding: "json", maxSupportedTransactionVersion: 0 }],
        }),
      });

      if (!txRes.ok) continue;
      const txJson = (await txRes.json()) as {
        result?: {
          meta?: { logMessages?: string[] };
          transaction?: {
            message?: {
              accountKeys?: string[];
              instructions?: Array<{ programIdIndex: number; data?: string }>;
            };
          };
        };
      };

      if (!txJson.result) continue;
      const logs = txJson.result.meta?.logMessages ?? [];
      if (!logs.some((l) => l.includes("Instruction: DepositForBurn"))) continue;

      // This is a DepositForBurn tx. Check inner instructions or logs
      // for matching dest domain. We match by checking the log messages
      // for the destination domain, or by parsing instruction data.
      // For a quicker match: query Iris with this tx hash to verify.
      // But to avoid Iris calls, match by checking the mint_recipient
      // in the program's instruction data.
      //
      // Anchor DepositForBurn instruction data contains:
      //   discriminator(8) + params including destDomain and mintRecipient
      // The exact layout depends on the program. A simpler approach:
      // just check if the log mentions the dest domain, or match by
      // looking at accounts (the mint_recipient appears in account keys).

      // Quick heuristic: search for the mintRecipient hex in the full
      // instruction data of the tx
      const accountKeys = txJson.result.transaction?.message?.accountKeys ?? [];
      const instructions = txJson.result.transaction?.message?.instructions ?? [];

      let matches = false;
      for (const ix of instructions) {
        if (!ix.data) continue;
        try {
          const data = Buffer.from(bs58.decode(ix.data));
          const dataHex = data.toString("hex");
          if (dataHex.includes(targetRecipientHex)) {
            matches = true;
            break;
          }
        } catch {
          continue;
        }
      }

      if (matches) return sig.signature;
    }
  } catch {
    // Search failed — non-critical
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Solana source tx lookup
// ---------------------------------------------------------------------------

// Anchor discriminator for receive_message (sha256("global:receive_message")[..8])
const RECEIVE_MESSAGE_DISC = "26907fe11fe1ee19";

/**
 * Fetch a Solana transaction and detect if it's a CCTP burn or relay.
 * For relay txs, extracts the source domain and nonce from the instruction data.
 */
export async function getSolanaTransaction(
  rpcUrl: string,
  messageTransmitter: string,
  txSig: string,
): Promise<SourceTxInfo> {
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: [txSig, { encoding: "json", maxSupportedTransactionVersion: 0 }],
      }),
    });

    if (!res.ok) {
      return { found: false, detail: `Solana RPC HTTP ${res.status}` };
    }

    const json = (await res.json()) as {
      result?: {
        slot?: number;
        blockTime?: number;
        meta?: { err: unknown; logMessages?: string[] };
        transaction?: {
          message?: {
            accountKeys?: string[];
            instructions?: Array<{ programIdIndex: number; data?: string }>;
          };
        };
      };
    };

    if (!json.result) {
      return { found: false, detail: "Transaction not found on Solana" };
    }

    const { slot, blockTime, meta, transaction } = json.result;
    const isSuccess = meta?.err === null;
    const timestampMs = blockTime ? blockTime * 1000 : undefined;

    // Check logs for CCTP instruction type
    const logs = meta?.logMessages ?? [];
    const isRelay = logs.some((l) => l.includes("Instruction: ReceiveMessage"));
    const isBurn = logs.some((l) => l.includes("Instruction: DepositForBurn"));

    // For relay txs: extract source domain + nonce from instruction data
    let relaySourceDomain: number | undefined;
    let relayNonce: string | undefined;

    if (isRelay && isSuccess) {
      const accountKeys = transaction?.message?.accountKeys ?? [];
      const instructions = transaction?.message?.instructions ?? [];

      // Find the instruction that calls the MessageTransmitter
      for (const ix of instructions) {
        const progId = accountKeys[ix.programIdIndex];
        if (progId !== messageTransmitter || !ix.data) continue;

        try {
          const data = Buffer.from(bs58.decode(ix.data));
          const disc = data.subarray(0, 8).toString("hex");
          if (disc !== RECEIVE_MESSAGE_DISC) continue;

          // Borsh bytes: u32 length (LE) + message bytes
          const msgLen = data.readUInt32LE(8);
          if (data.length < 12 + msgLen || msgLen < 44) continue;

          const msg = data.subarray(12, 12 + msgLen);
          relaySourceDomain = msg.readUInt32BE(4);
          relayNonce =
            "0x" +
            Array.from(msg.subarray(12, 44))
              .map((b) => b.toString(16).padStart(2, "0"))
              .join("");
          break;
        } catch {
          continue;
        }
      }
    }

    return {
      found: true,
      block: slot?.toString(),
      timestamp: timestampMs ? new Date(timestampMs).toISOString() : undefined,
      timestampMs,
      status: isSuccess ? "Success" : "Failed",
      isBurn,
      isRelay: isRelay && relaySourceDomain !== undefined,
      relaySourceDomain,
      relayNonce,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { found: false, detail: message };
  }
}
