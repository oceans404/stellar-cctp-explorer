// ---------------------------------------------------------------------------
// Chain configuration types
// ---------------------------------------------------------------------------

export interface EvmChainConfig {
  type: "evm";
  name: string;
  slug: string;
  domain: number;
  chainId: number;
  rpcUrl: string;
  tokenMessengerV2: `0x${string}`;
  messageTransmitterV2: `0x${string}`;
  usdcAddress: `0x${string}`;
  explorerUrl: string;
  enabled: boolean;
  burnSearchBlocks: number;
  relaySearchBlocks: number;
}

export interface StellarChainConfig {
  type: "stellar";
  name: string;
  slug: string;
  domain: number;
  rpcUrl: string;
  horizonUrl: string;
  networkPassphrase: string;
  tokenMessengerMinter: string;
  messageTransmitter: string;
  cctpForwarder: string;
  usdcSac: string;
  explorerUrl: string;
  enabled: boolean;
}

export interface SolanaChainConfig {
  type: "solana";
  name: string;
  slug: string;
  domain: number;
  rpcUrl: string;
  messageTransmitter: string;
  explorerUrl: string;
  enabled: boolean;
}

export type ChainConfig = EvmChainConfig | StellarChainConfig | SolanaChainConfig;

// ---------------------------------------------------------------------------
// Network configuration
// ---------------------------------------------------------------------------

export interface NetworkConfig {
  id: NetworkName;
  label: string;
  enabled: boolean;
  chains: Record<string, ChainConfig>;
  irisApiBase: string;
}

export type NetworkName = "testnet" | "mainnet";

// ---------------------------------------------------------------------------
// CCTP message types (V2)
// ---------------------------------------------------------------------------

export interface CctpMessageHeader {
  version: number;
  sourceDomain: number;
  destinationDomain: number;
  nonce: Uint8Array; // V2: bytes32 (32 bytes)
  sender: Uint8Array;
  recipient: Uint8Array;
  destinationCaller: Uint8Array;
  minFinalityThreshold: number;
  finalityThresholdExecuted: number;
}

export interface BurnMessageV2Body {
  version: number;
  burnToken: Uint8Array;
  mintRecipient: Uint8Array;
  amount: bigint;
  messageSender: Uint8Array;
  maxFee: bigint;
  feeExecuted: bigint;
  expirationBlock: bigint;
  hookData: Uint8Array;
}

export interface ParsedCctpMessage {
  header: CctpMessageHeader;
  body: BurnMessageV2Body | null;
  rawBytes: Uint8Array;
}

// ---------------------------------------------------------------------------
// Hook data
// ---------------------------------------------------------------------------

export interface HookData {
  magic: Uint8Array;
  isSelfRelay: boolean;
  version: number;
  recipientLength: number;
  recipient: string;
  recipientType: string;
  isValid: boolean;
}

// ---------------------------------------------------------------------------
// Transfer tracking
// ---------------------------------------------------------------------------

export interface SourceTxInfo {
  found: boolean;
  block?: string;
  timestamp?: string;
  timestampMs?: number;
  status?: string;
  isBurn?: boolean;
  /** True when the entered tx is a relay (receiveMessage), not a burn */
  isRelay?: boolean;
  /** Source domain extracted from the MessageReceived event */
  relaySourceDomain?: number;
  /** Nonce extracted from the MessageReceived event (hex) */
  relayNonce?: string;
  /** Burn tx hash recovered from reverse lookup (when entering from relay side) */
  burnTxHash?: string;
  detail?: string;
}

export interface AttestationInfo {
  found: boolean;
  status?: "pending" | "complete";
  attestation?: string;
  message?: string;
  amount?: string;
  eventNonce?: string;
  sourceDomain?: number;
  destDomain?: number;
  fee?: string;
  finalityThreshold?: string;
  finalityThresholdExecuted?: string;
  cctpVersion?: number;
  delayReason?: string | null;
  sender?: string;
  recipient?: string;
  destinationCaller?: string;
  attestedAt?: string;
  attestedAtMs?: number;
  detail?: string;
}

export interface NonceLookupResult {
  found: boolean;
  status?: "pending" | "complete";
  attestation?: string;
  message?: string;
  cctpVersion?: number;
  detail?: string;
}

export interface RelayInfo {
  checked: boolean;
  nonceUsed?: boolean;
  relayTxHash?: string;
  detail?: string;
}

export interface TransferStatus {
  sourceTx: SourceTxInfo;
  attestation: AttestationInfo;
  relay: RelayInfo;
  decoded: ParsedCctpMessage | null;
  hookData: HookData | null;
}

// ---------------------------------------------------------------------------
// Fee types
// ---------------------------------------------------------------------------

export interface ChainFeeConfig {
  domain: number;
  name: string;
  fastFeeBps: number | null;
  standardTime: string;
  fastTime: string | null;
  estimatedGasCostUsd: number;
}

/** Raw response from Iris: GET /v2/burn/USDC/fees/{src}/{dst} */
export interface IrisFeeEntry {
  finalityThreshold: number; // 1000 = fast, 2000 = standard
  minimumFee: number; // basis points
}

/** Normalized fee entry assembled from per-route Iris calls */
export interface ApiFeeEntry {
  sourceDomain: number;
  destDomain: number;
  fastFeeBps: number; // from finalityThreshold=1000
  standardFeeBps: number; // from finalityThreshold=2000 (always 0)
}

export interface TransferCostResult {
  fromChain: ChainFeeConfig;
  toChain: ChainFeeConfig;
  amount: number;
  speed: "standard" | "fast";
  feeBps: number;
  feeUsd: number;
  estimatedGasCostUsd: number;
  totalCostUsd: number;
  amountReceived: number;
  estimatedTime: string;
  fastAvailable: boolean;
  feeSource: "api" | "estimate";
}

// ---------------------------------------------------------------------------
// Recent transactions
// ---------------------------------------------------------------------------

export interface RecentBurnTx {
  txHash: string;
  chainSlug: string;
  amount: string;
  sourceDomain: number;
  destinationDomain: number;
  timestampMs: number;
}
