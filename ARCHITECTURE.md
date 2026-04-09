# CCTP Explorer Architecture

How the explorer tracks a CCTP transfer across its full lifecycle: **Burn -> Attestation -> Relay**.

---

## The CCTP Transfer Lifecycle

A cross-chain USDC transfer via CCTP has three phases:

1. **Burn** (source chain): User calls `deposit_for_burn` on the TokenMessengerMinter. USDC is burned and a `MessageSent` event is emitted by the MessageTransmitter contract. The message contains the nonce, source/destination domains, amount, sender, recipient, and fee parameters.

2. **Attestation** (off-chain): Circle's attestation service observes the burn event, waits for finality, and produces a signature (`attestation`) over the message bytes. This is queryable via the Iris API.

3. **Relay** (destination chain): Anyone calls `receive_message` on the destination MessageTransmitter with the message bytes + attestation. The nonce is marked as used and USDC is minted to the recipient.

## Entry Points

Users can enter the explorer from **either side** of the transfer:

```
User enters tx hash
       |
       v
  Is it a burn?  ----yes----> Normal flow (Burn -> Iris -> Relay check)
       |
       no
       |
  Is it a relay? ----yes----> Reverse flow (extract nonce -> Iris -> show full lifecycle)
       |
       no
       |
  "Not a CCTP transaction"
```

## How Each Chain Detects Burns vs Relays

### EVM (Ethereum, Base, Arbitrum, etc.)

**Source**: `track-transfer.ts` -> `fetchEvmSourceTx`

Fetches the transaction receipt via `eth_getTransactionReceipt` and checks event logs:

| Detection | Event Topic | Where |
|-----------|------------|-------|
| Burn | `MessageSent` (`0x2c32d4...`) | Any log in the receipt |
| Relay | `MessageReceived` (`0xff48c1...`) | Any log in the receipt |

For relay detection, the `MessageReceived` event contains:
- `topic[1]`: caller address
- `topic[2]`: nonce (bytes32)
- `topic[3]`: finality threshold
- `data[0]`: source domain (uint256)

### Stellar

**Source**: `soroban-client.ts` -> `getStellarTransaction`

Fetches the transaction via Soroban RPC `getTransaction` and inspects `diagnosticEventsXdr`. Diagnostic events include all sub-invocations, so we catch both direct calls and calls routed through the CCTP Forwarder contract.

| Detection | What to look for |
|-----------|-----------------|
| Burn | `fn_call` to `tokenMessengerMinter.deposit_for_burn` (or `deposit_for_burn_with_caller`) |
| Relay | `fn_call` to `messageTransmitter.receive_message` |

For relay detection, the `receive_message` call args are:
- `arg[0]`: caller (Address)
- `arg[1]`: CCTP message bytes (Bytes) -- contains sourceDomain at offset 4 and nonce at offset 12
- `arg[2]`: attestation signature (Bytes)

### Solana

**Source**: `solana-client.ts` -> `getSolanaTransaction`

Fetches the transaction via `getTransaction` RPC and checks `meta.logMessages` for Anchor instruction names:

| Detection | Log pattern |
|-----------|------------|
| Burn | `"Instruction: DepositForBurn"` |
| Relay | `"Instruction: ReceiveMessage"` |

For relay detection, the instruction data is parsed:
- Bytes 0-7: Anchor discriminator (`26907fe11fe1ee19` for `receive_message`)
- Bytes 8-11: Borsh message length (u32, little-endian)
- Bytes 12+: CCTP message bytes -- contains sourceDomain at offset 4 and nonce at offset 12

## Relay Resolution Flow

When a relay tx is detected on any chain, `resolveFromRelay` in `track-transfer.ts` takes over:

```
Relay tx detected
  |
  +--> Extract sourceDomain + nonce from chain-specific data
  |
  +--> Query Iris: GET /v2/messages/{sourceDomain}?nonce={nonce}
  |      |
  |      +--> Returns: attestation, message bytes, cctpVersion, status
  |
  +--> Decode CCTP message from Iris response
  |      |
  |      +--> Sender, recipient, amount, destination, fees, hook data
  |
  +--> Try to find the original burn tx on the source chain (best-effort)
  |      |
  |      +--> See "Burn Transaction Reverse Lookup" below
  |
  +--> Return TransferStatus with:
         - sourceTx.isRelay = true
         - sourceTx.burnTxHash = found burn tx (if any)
         - attestation from Iris
         - relay.nonceUsed = true, relay.relayTxHash = the entered tx hash
```

If the burn tx is found, the UI shows the burn tx hash with an explorer link. If not, the burn phase still displays the decoded transfer details (amount, sender, recipient, etc.) from the Iris message.

## Relay Transaction Hash Lookup

When displaying a **burn tx** (normal flow), the explorer needs to find the relay tx on the destination chain to show the "View relay tx on X explorer" link.

| Destination | Method | How |
|-------------|--------|-----|
| EVM | `eth_getLogs` | Search for `MessageReceived` events on the MessageTransmitter, filtering by nonce in `topic[2]`. Scans last 10k blocks. |
| Stellar | `getEvents` | Search for `message_received` contract events on the MessageTransmitter, filtering by nonce in topic position 2. See [SorobanGotcha.md](./SorobanGotcha.md) for the topic filter format. Starts from `latestLedger - 50000` with cursor pagination. |
| Solana | `getSignaturesForAddress` | Derive the `used_nonce` PDA from the nonce bytes + MessageTransmitter program ID, then get the first successful signature for that PDA address. |

## Burn Transaction Reverse Lookup

When the user enters a **relay tx** (destination side), the explorer attempts to find the original burn tx on the source chain. This is best-effort — Iris does not return the source tx hash, so chain-specific strategies are needed.

### Why this is hard

- **Iris doesn't return the burn tx hash** in its response (neither by txHash query nor by nonce query).
- **EVM `MessageSent(bytes)`** has zero indexed parameters — you can't filter by nonce via `eth_getLogs`.
- **Stellar `message_sent` events** emit the CCTP message with the **nonce zeroed out** (assigned by the contract after event emission) and `finalityThresholdExecuted` set to zero (filled by the attestation service). So matching by nonce or full message equality doesn't work.

### Strategies by source chain

| Source chain | Strategy | Matching logic |
|---|---|---|
| **Stellar** | Soroban `getEvents` (if within retention) → Horizon account operations fallback | Compare CCTP message bytes ignoring nonce (bytes 12-43) and finalityThresholdExecuted (bytes 144-147) |
| **EVM** | `eth_getLogs` for `DepositForBurn` events filtered by `depositor` (indexed topic) | Match by `mintRecipient` + `destinationDomain` from event data |
| **Solana** | `getSignaturesForAddress` on the sender wallet | Check logs for `DepositForBurn`, match by `mintRecipient` in instruction data |

### Stellar: two-tier lookup

**Source**: `soroban-client.ts` -> `findStellarBurnTx`

**Tier 1 — Soroban `getEvents`**: Scan `message_sent` events on the MessageTransmitter contract. The event has 1 topic (`message_sent`) and a value map `{message: <bytes>}` containing the raw CCTP message. Match by comparing the full message with the Iris message, ignoring the two zeroed-out fields. Limited by the Soroban RPC retention window (~7 days on testnet).

**Tier 2 — Horizon fallback**: If not found via events (burn outside retention window), use the `messageSender` from the decoded CCTP body to derive the Stellar account address (Ed25519 public key). Query Horizon for that account's recent `invoke_host_function` operations (up to 50). For each candidate, fetch the transaction via Soroban `getTransaction` and inspect diagnostic events for:
1. A `deposit_for_burn` fn_call on the TokenMessengerMinter (confirms it's a burn)
2. A `message_sent` contract event whose CCTP message matches (ignoring nonce + finalityThresholdExecuted)

Horizon retains history much longer than the Soroban event index, so this covers burns that have fallen out of the event retention window.

### Stellar message matching gotcha

The on-chain `message_sent` event differs from the Iris message in two fields:

| Bytes | Field | On-chain value | Iris value | Why |
|-------|-------|---------------|------------|-----|
| 12-43 | nonce | `0x00...00` | Real nonce | Assigned by MessageTransmitter after event emission |
| 144-147 | finalityThresholdExecuted | `0` | Actual threshold | Filled by Circle's attestation service |

The comparison function `cctpMessageMatchesIgnoringNonce` skips these two ranges and compares everything else: version, domains, sender, recipient, destinationCaller, minFinalityThreshold, and the full body (burnToken, mintRecipient, amount, messageSender, fees, hookData).

### EVM: DepositForBurn event search

**Source**: `track-transfer.ts` -> `findEvmBurnTx`

The `DepositForBurn` event on the TokenMessengerV2 contract has three indexed topics:

| Topic | Field | Use |
|-------|-------|-----|
| `topic[0]` | Event signature (`0x0c8c1cbd...`) | Filter by event type |
| `topic[1]` | `burnToken` (address) | Not filtered |
| `topic[2]` | `depositor` (address) | **Filtered** — the sender from the decoded CCTP message |
| `topic[3]` | `minFinalityThreshold` (uint32) | Not filtered |

The depositor address is extracted from the CCTP body's `messageSender` field (last 20 bytes of the 32-byte value). The search scans the last 50k blocks in 10k-block chunks (some RPCs limit log query range). Each matching event's non-indexed data is decoded to check `mintRecipient` + `destinationDomain` against the CCTP message.

### Solana: sender wallet history

**Source**: `solana-client.ts` -> `findSolanaBurnTx`

The sender wallet address is extracted from the CCTP body's `messageSender` (32-byte Solana public key, base58-encoded). The search uses `getSignaturesForAddress` to get the wallet's last 50 successful transactions, then for each:

1. Fetch the transaction via `getTransaction`
2. Check `logMessages` for `"Instruction: DepositForBurn"`
3. If it's a burn, search the instruction data for the target `mintRecipient` hex string

This works because the `mintRecipient` + `destinationDomain` combination uniquely identifies a transfer from a given sender.

## External APIs

### Circle Iris API

The explorer queries Circle's Iris API for attestation data:

| Endpoint | Use |
|----------|-----|
| `GET /v2/messages/{sourceDomain}?transactionHash={hash}` | Normal flow: look up attestation by source burn tx hash |
| `GET /v2/messages/{sourceDomain}?nonce={nonce}` | Reverse flow: look up attestation by nonce (for relay entry or decoder) |

Iris returns: `attestation` (signature hex), `message` (raw CCTP message hex), `eventNonce`, `cctpVersion`, `status`, `decodedMessage`.

Note: Iris does **not** return the source burn transaction hash in either query mode.

### Chain RPCs

| Chain | RPC | Endpoints used |
|-------|-----|---------------|
| EVM | JSON-RPC (e.g., `sepolia.base.org`) | `eth_getTransactionReceipt`, `eth_getBlockByNumber`, `eth_call`, `eth_blockNumber`, `eth_getLogs` |
| Stellar | Soroban RPC (e.g., `soroban-testnet.stellar.org`) | `getTransaction`, `simulateTransaction`, `getEvents`, `getLatestLedger` |
| Stellar | Horizon (e.g., `horizon-testnet.stellar.org`) | `GET /accounts/{id}/operations` — used as fallback for burn tx lookup when Soroban event retention window is exceeded |
| Solana | JSON-RPC (e.g., `api.devnet.solana.com`) | `getTransaction`, `getAccountInfo`, `getSignaturesForAddress` |

## CCTP Message Format

The CCTP V2 message is a fixed-layout binary format. The raw version field is 0-indexed relative to the protocol version (raw `0` = CCTP V1, raw `1` = CCTP V2).

### Header (148 bytes)

| Offset | Size | Field |
|--------|------|-------|
| 0 | 4 | version |
| 4 | 4 | sourceDomain |
| 8 | 4 | destinationDomain |
| 12 | 32 | nonce (bytes32) |
| 44 | 32 | sender |
| 76 | 32 | recipient |
| 108 | 32 | destinationCaller |
| 140 | 4 | minFinalityThreshold |
| 144 | 4 | finalityThresholdExecuted |

### BurnMessage Body (228 bytes, after header)

| Offset | Size | Field |
|--------|------|-------|
| 0 | 4 | version |
| 4 | 32 | burnToken |
| 36 | 32 | mintRecipient |
| 68 | 32 | amount (uint256) |
| 100 | 32 | messageSender |
| 132 | 32 | maxFee (uint256) |
| 164 | 32 | feeExecuted (uint256) |
| 196 | 32 | expirationBlock (uint256) |

Followed by optional hookData (uint256 length prefix + raw bytes).

## Message Decoder

The `/decode` page parses raw CCTP message hex client-side using `parse-message.ts`. It also:
- Computes `messageHash = keccak256(rawBytes)` for identification
- Computes `nonceHash = keccak256(sourceDomain, nonce)` for relay status checks
- Queries Iris by nonce via "Look up on Iris" button to verify attestation status

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/track-transfer.ts` | Orchestrator: fetches source tx, attestation, relay status; handles relay detection and burn tx reverse lookup (`resolveFromRelay`, `findEvmBurnTx`) |
| `src/lib/iris-client.ts` | Circle Iris API client: `fetchAttestation` (by tx hash), `fetchMessageByNonce` (by nonce) |
| `src/lib/soroban-client.ts` | Stellar: tx lookup, burn/relay detection, nonce check, relay tx search via `getEvents`, burn tx reverse lookup via `getEvents` + Horizon fallback (`findStellarBurnTx`) |
| `src/lib/solana-client.ts` | Solana: nonce PDA check, relay tx search, source tx lookup with burn/relay detection, burn tx reverse lookup via sender wallet history (`findSolanaBurnTx`) |
| `src/lib/parse-message.ts` | CCTP message decoder, address helpers, version label mapping |
| `src/lib/nonce-hash.ts` | Computes `keccak256(sourceDomain, nonce)` for Stellar nonce checks |
| `src/components/MessageDecoder.tsx` | `/decode` page: paste hex, decode fields, look up attestation |
| `src/components/TransferTracker.tsx` | `/tx` page: polls API, renders BurnPhase + AttestationPhase + RelayPhase |
| `src/components/BurnPhase.tsx` | Renders burn details; for relay entry, shows recovered burn tx hash + explorer link when available |
| `src/components/RelayPhase.tsx` | Renders relay details with explorer link; shows message bytes + attestation for manual relay |
| `SorobanGotcha.md` | Soroban RPC quirks we discovered (topic filter format, scan limits, XDR encoding) |
