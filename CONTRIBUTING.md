# Contributing: Adding a new network

This guide covers adding a new chain to the explorer. Most additions are an existing chain type (EVM, Stellar, or Solana) and stay in config + fees. A brand-new chain type (e.g., Sui, Cosmos) requires writing a client module and is covered briefly at the end.

## Before you start: collect from Circle

Get these from Circle's official docs before editing anything:

| Item | Where |
|---|---|
| CCTP domain ID | [Circle CCTP supported chains](https://developers.circle.com/cctp/supported-domains) |
| TokenMessengerV2 + MessageTransmitterV2 (EVM) | [contract-addresses](https://developers.circle.com/cctp/references/contract-addresses) — typically Create2-identical across EVM chains |
| Stellar mainnet contracts (TokenMessengerMinter, MessageTransmitter, CctpForwarder) | [stellar-contracts](https://developers.circle.com/cctp/references/stellar-contracts) |
| Solana program IDs | [solana-programs](https://developers.circle.com/cctp/references/solana-programs) |
| Native USDC contract address | [usdc-contract-addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses) |
| Chain-specific extras | RPC endpoints, block explorer URL, EVM chainId, Stellar network passphrase, Stellar USDC SAC (derive with `stellar contract id asset --asset "USDC:<issuer>" --network <name>`) |

If Circle hasn't published mainnet addresses yet, add the chain in `mainnet.ts` with `enabled: false` and zero-address placeholders. Pattern: see Arc in `src/lib/networks/mainnet.ts`.

## Adding an EVM, Stellar, or Solana chain

### 1. Add the chain config

Edit `src/lib/networks/mainnet.ts` (and `src/lib/networks/testnet.ts` if a testnet variant exists). Shape varies by type:

**EVM:**
```ts
newchain: {
  type: "evm",
  name: "New Chain",
  slug: "newchain",
  domain: <id>,
  chainId: <evm chainId>,
  rpcUrl: "",
  tokenMessengerV2: "0x...",
  messageTransmitterV2: "0x...",
  usdcAddress: "0x...",
  explorerUrl: "https://newchainscan.io",
  enabled: false,
  burnSearchBlocks: <range>,
  relaySearchBlocks: <range>,
},
```

`burnSearchBlocks` is the lookback window for `eth_getLogs` when reverse-resolving a burn from a relay (used in `findEvmBurnTx`). `relaySearchBlocks` is the lookback for finding the relay tx given a burn. Pick values that match chain block time: faster chains need more blocks to cover the same wall-clock window. See existing entries for reference.

**Stellar:** see the `stellar` entry pattern. Includes `horizonUrl`, `networkPassphrase`, four contract IDs.

**Solana:** see the `solana` entry pattern. Just `rpcUrl`, `messageTransmitter` program ID, and `explorerUrl`.

The slug is the object key and feeds `{SLUG_UPPER_SNAKE}_RPC_URL` env-var resolution. Use lowercase, hyphen-separated.

### 2. Map the domain ID (only if new)

Edit `src/lib/config.ts` and add the domain to `DOMAIN_NAMES`. Skip if the domain is already mapped (current set: 0-8, 26, 27).

```ts
export const DOMAIN_NAMES: Record<number, string> = {
  ...,
  <id>: "New Chain",
};
```

### 3. Register fee data

Edit `src/lib/fee-calculator.ts` and add to `CHAIN_FEES`:

```ts
{
  domain: <id>,
  name: "New Chain",
  fastFeeBps: <number | null>,    // null = no fast transfer support
  standardTime: "~X minutes",
  fastTime: "~Y seconds" | null,
  estimatedGasCostUsd: <number>,
},
```

This drives the Fee Reference UI and shows up in `/api/fees` responses. Without an entry the chain renders as `Unknown(<id>)`.

### 4. Add the RPC env var

Edit `.env.example`. Add the var name and a working public default (use a paid endpoint in Vercel for prod):

```
NEWCHAIN_RPC_URL=https://...
```

If a chain is `enabled: true` and its RPC URL resolves to empty, the first server-side API call throws with the missing env var name.

### 5. Smoke test locally

With `enabled: false`, no API call hits the chain. To test live:

1. Set `enabled: true` for the chain in the relevant network config.
2. Restart `pnpm dev`.
3. Verify the configured endpoints respond:
   ```bash
   curl -s "http://localhost:3000/api/fees?network=mainnet" | jq '.chainFees[] | select(.name=="New Chain")'
   curl -s "http://localhost:3000/api/recent-txs?network=mainnet" | jq
   ```
4. If a real burn tx exists on the new chain, confirm end-to-end lifecycle:
   ```bash
   curl -s "http://localhost:3000/api/transfer/<sourceDomain>/<burnHash>?network=mainnet" | jq
   ```
5. UI: switch to the relevant network in the dropdown, paste a real burn hash, confirm all three phases (Burn / Attestation / Relay) render.

### 6. Enable

Flip `enabled: true` for the chain in the config, commit, deploy.

## Adding a brand-new chain type

If the chain isn't EVM, Stellar, or Solana, additional work is needed beyond config:

| Touch point | What to add |
|---|---|
| `src/lib/types.ts` | New `XChainConfig` interface and add to `ChainConfig` union |
| `src/lib/x-client.ts` | New client module: source-tx lookup, burn/relay detection, nonce-used check, relay-tx search by nonce, burn reverse-lookup |
| `src/lib/track-transfer.ts:288-305` | New `else if (sourceChain?.type === "x")` branch in `getTransferStatus`. Same for `resolveFromRelay`. |
| `src/lib/config.ts:64-77` | New `case "x"` in `explorerTxUrl` |
| `src/lib/parse-message.ts:88`, `src/components/{BurnPhase,RelayPhase,MessageDecoder}.tsx` | Address formatting for the new chain's address type if not 0x-hex (Stellar uses strkey, Solana uses base58) |

Look at the Stellar (`soroban-client.ts`) or Solana (`solana-client.ts`) modules as references. The Stellar one is the most complete since it implements both the event-based and Horizon-fallback reverse-lookup paths.

## Code conventions

- TypeScript strict. Don't disable strict flags or add `any`.
- Server-side env vars stay non-`NEXT_PUBLIC_` to keep API keys out of the client bundle.
- New chain entries default to `enabled: false`. Flip on only after local smoke tests pass.
- For Next.js 16-specific patterns, check `node_modules/next/dist/docs/` before writing code (see `AGENTS.md`).
