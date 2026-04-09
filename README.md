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

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed documentation on:
- How each chain detects burns vs relays
- The relay resolution and burn tx reverse lookup strategies
- CCTP V2 message format
- External API usage (Circle Iris, chain RPCs, Horizon)

## Test Cases

See [TEST_CASES.md](./TEST_CASES.md) for real testnet transfers used to validate the explorer.
