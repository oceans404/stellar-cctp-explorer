import { StrKey } from "@stellar/stellar-sdk";
import type { HookData } from "./types";

function validateStrkey(strkey: string): { valid: boolean; type: string } {
  if (StrKey.isValidEd25519PublicKey(strkey)) {
    return { valid: true, type: "Ed25519 Public Key (G...)" };
  }
  if (StrKey.isValidContract(strkey)) {
    return { valid: true, type: "Contract (C...)" };
  }
  if (StrKey.isValidMed25519PublicKey(strkey)) {
    return { valid: true, type: "Med25519 Public Key (M...)" };
  }
  return { valid: false, type: "unknown" };
}

export function decodeHookData(hookBytes: Uint8Array): HookData {
  if (hookBytes.length < 32) {
    return {
      magic: new Uint8Array(0),
      isSelfRelay: false,
      version: 0,
      recipientLength: 0,
      recipient: "",
      recipientType: "unknown",
      isValid: false,
    };
  }

  // Try raw ASCII Stellar address first (EVM→Stellar transfers encode the
  // recipient G.../C... address directly as ASCII in hookData)
  const asAscii = new TextDecoder().decode(hookBytes);
  const asciiValidation = validateStrkey(asAscii);
  if (asciiValidation.valid) {
    return {
      magic: new Uint8Array(0),
      isSelfRelay: false,
      version: 0,
      recipientLength: hookBytes.length,
      recipient: asAscii,
      recipientType: asciiValidation.type,
      isValid: true,
    };
  }

  // Structured format: magic(24) + version(4) + recipientLength(4) + recipient(N)
  const magic = hookBytes.slice(0, 24);
  const isSelfRelay = magic.every((b) => b === 0);
  const view = new DataView(hookBytes.buffer, hookBytes.byteOffset, hookBytes.byteLength);
  const version = view.getUint32(24, false);
  const recipientLength = view.getUint32(28, false);

  if (recipientLength === 0 || recipientLength > 256 || 32 + recipientLength > hookBytes.length) {
    return {
      magic,
      isSelfRelay,
      version,
      recipientLength,
      recipient: "",
      recipientType: "unknown",
      isValid: false,
    };
  }

  const recipientBytes = hookBytes.slice(32, 32 + recipientLength);
  const recipient = new TextDecoder().decode(recipientBytes);
  const validation = validateStrkey(recipient);

  return {
    magic,
    isSelfRelay,
    version,
    recipientLength,
    recipient,
    recipientType: validation.type,
    isValid: validation.valid,
  };
}
