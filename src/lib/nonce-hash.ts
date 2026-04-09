import { keccak256, encodePacked } from "viem";

/**
 * Compute the nonce hash used by CCTP V2 MessageTransmitters.
 * nonce_hash = keccak256(abi.encodePacked(uint32 sourceDomain, bytes32 nonce))
 *
 * V2 changed the nonce from uint64 to bytes32 (32 bytes).
 */
export function computeNonceHash(
  sourceDomain: number,
  nonce: Uint8Array
): `0x${string}` {
  const nonceHex = ("0x" +
    Array.from(nonce)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")) as `0x${string}`;

  return keccak256(
    encodePacked(["uint32", "bytes32"], [sourceDomain, nonceHex])
  );
}
