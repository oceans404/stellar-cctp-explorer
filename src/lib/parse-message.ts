import { StrKey } from "@stellar/stellar-sdk";
import { keccak256 } from "viem";
import type { CctpMessageHeader, BurnMessageV2Body, ParsedCctpMessage } from "./types";

// V2 message header: 148 bytes
const HEADER_SIZE = 148;

// BurnMessageV2 fixed body fields end at offset 228 (before hookData)
const BURN_MSG_FIXED_SIZE = 228;

// ---------------------------------------------------------------------------
// DataView helpers (browser-compatible, no Node.js Buffer)
// ---------------------------------------------------------------------------

function readUint32(data: DataView, offset: number): number {
  return data.getUint32(offset, false); // big-endian
}

function readUint64(data: DataView, offset: number): bigint {
  return data.getBigUint64(offset, false);
}

function readBytes(buf: Uint8Array, offset: number, length: number): Uint8Array {
  return buf.slice(offset, offset + length);
}

function readUint256(data: DataView, offset: number): bigint {
  const hi = data.getBigUint64(offset, false);
  const mid1 = data.getBigUint64(offset + 8, false);
  const mid2 = data.getBigUint64(offset + 16, false);
  const lo = data.getBigUint64(offset + 24, false);
  return (hi << 192n) | (mid1 << 128n) | (mid2 << 64n) | lo;
}

// ---------------------------------------------------------------------------
// Address decoding
// ---------------------------------------------------------------------------

export function bytesToHex(bytes: Uint8Array): string {
  return "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function tryDecodeBytes32ToStrkey(
  bytes32: Uint8Array,
  preferEd25519 = false,
): string | null {
  // StrKey methods accept Uint8Array at runtime but types may expect Buffer
  const tryContract = () => {
    try {
      const encoded = StrKey.encodeContract(bytes32 as unknown as Buffer);
      if (StrKey.isValidContract(encoded)) return encoded;
    } catch { /* ignore */ }
    return null;
  };

  const tryEd25519 = () => {
    try {
      const encoded = StrKey.encodeEd25519PublicKey(bytes32 as unknown as Buffer);
      if (StrKey.isValidEd25519PublicKey(encoded)) return encoded;
    } catch { /* ignore */ }
    return null;
  };

  if (preferEd25519) {
    return tryEd25519() ?? tryContract();
  }
  return tryContract() ?? tryEd25519();
}

export function tryDecodeEvmAddress(bytes32: Uint8Array): string | null {
  const prefix = bytes32.slice(0, 12);
  if (prefix.every((b) => b === 0)) {
    const addrBytes = bytes32.slice(12, 32);
    if (!addrBytes.every((b) => b === 0)) {
      return "0x" + Array.from(addrBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  }
  return null;
}

export function decodeAddress(
  bytes32: Uint8Array,
  domain: number,
  preferEd25519 = false,
): string {
  const hex = bytesToHex(bytes32);

  if (domain === 27) {
    const strkey = tryDecodeBytes32ToStrkey(bytes32, preferEd25519);
    if (strkey) return strkey;
  }

  if ([0, 1, 2, 3, 6, 7].includes(domain)) {
    const evmAddr = tryDecodeEvmAddress(bytes32);
    if (evmAddr) return evmAddr;
  }

  return hex;
}

// ---------------------------------------------------------------------------
// Message hash
// ---------------------------------------------------------------------------

/**
 * Compute the message hash: keccak256 of the raw CCTP message bytes.
 * This is the identifier Circle's Iris API uses for attestation lookups.
 */
export function computeMessageHash(rawBytes: Uint8Array): `0x${string}` {
  return keccak256(rawBytes);
}

// ---------------------------------------------------------------------------
// Version helpers
// ---------------------------------------------------------------------------

/**
 * The raw version field in CCTP messages is 0-indexed:
 *   raw 0 → CCTP V1 (original protocol)
 *   raw 1 → CCTP V2 (finality thresholds, fees, etc.)
 */
export function cctpVersionLabel(rawVersion: number): string {
  return `V${rawVersion + 1}`;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export function parseCctpMessage(hexInput: string): ParsedCctpMessage {
  let hex = hexInput;
  if (hex.startsWith("0x") || hex.startsWith("0X")) {
    hex = hex.slice(2);
  }

  if (!/^[0-9a-fA-F]*$/.test(hex)) {
    throw new Error("Input contains non-hex characters");
  }

  if (hex.length % 2 !== 0) {
    throw new Error("Hex string has odd length — must be even (full bytes)");
  }

  const bytes = new Uint8Array(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));

  if (bytes.length < HEADER_SIZE) {
    throw new Error(
      `Message too short: got ${bytes.length} bytes, need at least ${HEADER_SIZE} for V2 header`
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Parse V2 header (148 bytes)
  // version(4) + sourceDomain(4) + destinationDomain(4) + nonce(32) +
  // sender(32) + recipient(32) + destinationCaller(32) +
  // minFinalityThreshold(4) + finalityThresholdExecuted(4) = 148
  const header: CctpMessageHeader = {
    version: readUint32(view, 0),
    sourceDomain: readUint32(view, 4),
    destinationDomain: readUint32(view, 8),
    nonce: readBytes(bytes, 12, 32),       // V2: bytes32
    sender: readBytes(bytes, 44, 32),
    recipient: readBytes(bytes, 76, 32),
    destinationCaller: readBytes(bytes, 108, 32),
    minFinalityThreshold: readUint32(view, 140),
    finalityThresholdExecuted: readUint32(view, 144),
  };

  // Parse body if present
  let body: BurnMessageV2Body | null = null;
  if (bytes.length > HEADER_SIZE) {
    const bodyBytes = bytes.slice(HEADER_SIZE);
    if (bodyBytes.length >= BURN_MSG_FIXED_SIZE) {
      const bodyView = new DataView(bodyBytes.buffer, bodyBytes.byteOffset, bodyBytes.byteLength);

      // Extract hookData: length (uint256, 32 bytes) + raw data
      let hookData = new Uint8Array(0);
      if (bodyBytes.length > BURN_MSG_FIXED_SIZE) {
        const hookSection = bodyBytes.slice(BURN_MSG_FIXED_SIZE);
        if (hookSection.length >= 32) {
          const hookSectionView = new DataView(
            hookSection.buffer,
            hookSection.byteOffset,
            hookSection.byteLength
          );
          const hookLength = Number(readUint256(hookSectionView, 0));
          if (hookLength > 0 && hookSection.length >= 32 + hookLength) {
            hookData = hookSection.slice(32, 32 + hookLength);
          }
        }
      }

      body = {
        version: readUint32(bodyView, 0),
        burnToken: readBytes(bodyBytes, 4, 32),
        mintRecipient: readBytes(bodyBytes, 36, 32),
        amount: readUint256(bodyView, 68),
        messageSender: readBytes(bodyBytes, 100, 32),
        maxFee: readUint256(bodyView, 132),
        feeExecuted: readUint256(bodyView, 164),
        expirationBlock: readUint256(bodyView, 196),
        hookData,
      };
    }
  }

  return { header, body, rawBytes: bytes };
}
