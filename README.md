# CCTP Explorer

A cross-chain USDC transfer explorer for Circle's [Cross-Chain Transfer Protocol (CCTP)](https://www.circle.com/cross-chain-transfer-protocol). Track the full lifecycle of any CCTP transfer: **Burn -> Attestation -> Relay**.

## Features

- **Transfer Tracker** — Enter a burn OR relay tx hash from any supported chain. The explorer resolves the full lifecycle in both directions.
- **Multi-chain** — EVM (Ethereum, Base, Arbitrum, Optimism, Avalanche, Polygon), Stellar, and Solana.
- **Burn tx reverse lookup** — When entering from the relay side, the explorer finds the original burn tx on the source chain (Stellar via Horizon, EVM via DepositForBurn logs, Solana via sender wallet history).
- **Message Decoder** — Paste raw CCTP message hex to decode all fields client-side.
- **Fee Calculator** — Interactive fee reference with live data from Circle's Iris API.
- **Network Switching** — Testnet and Mainnet support via URL params.

## Tech Stack

- [Next.js](https://nextjs.org) 16 (App Router)
- [React](https://react.dev) 19 with [TanStack Query](https://tanstack.com/query) for polling
- [Stellar Design System](https://github.com/stellar/stellar-design-system) for UI
- TypeScript throughout

## Getting Started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## RPC Configuration

Each chain's RPC URL can be overridden via environment variable. The variable name is the chain slug, uppercased, with hyphens converted to underscores, suffixed with `_RPC_URL`. Use this to inject paid endpoint URLs (Alchemy, Infura, QuickNode, Helius) without committing keys to the repo.

Overrides are server-side only — there is no `NEXT_PUBLIC_` prefix, so RPC URLs containing API keys do not leak into the client bundle.

If a network is `enabled: true` and any enabled chain has an empty `rpcUrl` after override resolution, the app throws at first API call with the missing env var name.

Testnet:

- `STELLAR_TESTNET_RPC_URL`
- `SOLANA_DEVNET_RPC_URL`
- `BASE_SEPOLIA_RPC_URL`
- `ETHEREUM_SEPOLIA_RPC_URL`
- `AVALANCHE_FUJI_RPC_URL`
- `OP_SEPOLIA_RPC_URL`
- `ARBITRUM_SEPOLIA_RPC_URL`
- `ARC_TESTNET_RPC_URL`
- `POLYGON_AMOY_RPC_URL`

Mainnet:

- `ETHEREUM_RPC_URL`
- `AVALANCHE_RPC_URL`
- `OPTIMISM_RPC_URL`
- `ARBITRUM_RPC_URL`
- `SOLANA_RPC_URL`
- `BASE_RPC_URL`
- `POLYGON_RPC_URL`
- `ARC_RPC_URL`
- `STELLAR_RPC_URL`

Also supported:

- `NEXT_PUBLIC_DEFAULT_NETWORK` — set to `testnet` or `mainnet` to control the default network on first page load.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed documentation on:
- How each chain detects burns vs relays
- The relay resolution and burn tx reverse lookup strategies
- CCTP V2 message format
- External API usage (Circle Iris, chain RPCs, Horizon)

## Test Cases

See [TEST_CASES.md](./TEST_CASES.md) for real testnet transfers used to validate the explorer.
