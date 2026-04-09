import { StrKey } from "@stellar/stellar-sdk";

/**
 * Detect chain type from a tx hash format.
 * - Stellar: 64 hex chars, no prefix
 * - EVM: 0x + 64 hex chars
 * - Solana: base58 encoded (32-88 chars, alphanumeric no 0OIl)
 */
export function detectChainFromHash(hash: string): "stellar" | "evm" | "solana" | "unknown" {
  if (/^0x[0-9a-fA-F]{64}$/.test(hash)) return "evm";
  if (/^[0-9a-fA-F]{64}$/.test(hash)) return "stellar";
  if (/^[1-9A-HJ-NP-Za-km-z]{32,88}$/.test(hash)) return "solana";
  return "unknown";
}

export function formatUsdc(amount: bigint, decimals: 6 | 7 = 6): string {
  const divisor = decimals === 7 ? 10_000_000n : 1_000_000n;
  const whole = amount / divisor;
  const frac = (amount % divisor).toString().padStart(decimals, "0");
  // Trim trailing zeros but keep at least 2 decimals
  const trimmed = frac.replace(/0+$/, "").padEnd(2, "0");
  return `${whole}.${trimmed}`;
}

export function truncateHash(s: string, len = 16): string {
  if (!s) return "(null)";
  if (s.length <= len) return s;
  return s.slice(0, len) + "...";
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

/**
 * Convert a Stellar contract strkey (C...) to a 0x-prefixed hex bytes32.
 */
export function contractStrkeyToBytes32(contractStrkey: string): string {
  if (!StrKey.isValidContract(contractStrkey)) {
    throw new Error(`Invalid contract strkey: ${contractStrkey}`);
  }
  const raw = StrKey.decodeContract(contractStrkey);
  return "0x" + Array.from(raw).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Pad a 20-byte EVM address to 32 bytes (left-padded with zeros).
 */
export function evmAddressToBytes32(evmAddress: string): string {
  const stripped = evmAddress.startsWith("0x") ? evmAddress.slice(2) : evmAddress;
  return "0x" + stripped.toLowerCase().padStart(64, "0");
}

export function timeAgo(timestampMs: number): string {
  const seconds = Math.floor((Date.now() - timestampMs) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return new Uint8Array(clean.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
}

export function bytesToHex(bytes: Uint8Array): string {
  return "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
