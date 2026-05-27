# CCTP Explorer

A cross-chain USDC transfer explorer for Circle's [Cross-Chain Transfer Protocol](https://www.circle.com/cross-chain-transfer-protocol). Track the full lifecycle of any CCTP transfer: **Burn -> Attestation -> Relay**.

Live on mainnet as of 2026-05-27 across Stellar, Ethereum, Avalanche, Optimism, Arbitrum, Base, Polygon, Solana, Unichain, Linea, Sonic, World Chain, Sei, and Ink. Arc is wired but disabled pending Circle's mainnet contracts. Testnet stays available via the network switcher.

## Features

- **Transfer Tracker**. Paste a burn or relay tx hash from any supported chain. Resolves the full lifecycle in both directions.
- **Burn tx reverse lookup**. When entering from the relay side, finds the burn tx on the source chain (Stellar via Horizon, EVM via DepositForBurn logs, Solana via sender history).
- **Message Decoder**. Paste raw CCTP message hex and decode all fields client-side.
- **Fee Calculator**. Live data from Circle's Iris API.
- **Network switcher**. Mainnet (default) and Testnet, switched in the dropdown.

## Tech stack

[Next.js 16](https://nextjs.org) (App Router) on [React 19](https://react.dev) with [TanStack Query](https://tanstack.com/query). UI from [@stellar/design-system](https://github.com/stellar/stellar-design-system). TypeScript throughout. pnpm.

## Getting started

```bash
pnpm install
cp .env.example .env.local   # public RPCs work out of the box
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## RPC configuration

Each chain's RPC URL is overridden via an environment variable named `{CHAIN_SLUG_UPPER_SNAKE}_RPC_URL` (see `src/lib/networks/env-overrides.ts`). Use this to inject paid endpoints (Alchemy, Helius, Validation Cloud, etc.) without committing keys.

Overrides are server-side only. No `NEXT_PUBLIC_` prefix, so RPC URLs that embed API keys never reach the client bundle.

If a chain is `enabled: true` and its RPC URL is empty after override resolution, the first server-side API call throws with the missing env var name. Disabled chains are skipped.

The full set of vars (mainnet and testnet) lives in [`.env.example`](./.env.example). Set the mainnet ones in Vercel for production. `NEXT_PUBLIC_DEFAULT_NETWORK` (values: `mainnet` or `testnet`) overrides the default network on first page load; the built-in default is `mainnet`.

## Production / operations

- **Paid RPCs.** Set the 14 mainnet `{SLUG}_RPC_URL` vars in Vercel to paid endpoints (Alchemy, Helius, Validation Cloud, etc.). Public endpoints rate-limit under any real load.
- **Pending chains.** Arc is wired with `enabled: false` and zero-address placeholders; flip on once Circle publishes Arc mainnet contracts + USDC and confirm chainId `18233`. Noble (domain 4) is absent from both configs by design; `DOMAIN_NAMES` still labels it.
- **Iris auth.** No prod API key wired today. Add one only if we hit the 25 req/s shared-tier ceiling. The field is not yet on `NetworkConfig`.
- **Rollback.** `cctp/` is not under git. Use Vercel's "Promote previous deployment" to roll back, or flip `enabled: false` on `mainnetConfig` (or per chain) in a follow-up commit.
- **Smoke tests for prod.** Per chain: `curl /api/recent-txs?network=mainnet`, `/api/fees?network=mainnet`, `/api/transfer/{sourceDomain}/{burnHash}?network=mainnet`.
- **Open questions.** Cost ceiling on RPC + Iris, secondary RPC fallback layer, `recent-txs` 30s cold-cache behavior on region cold-start.

## Reference

- [CONTRIBUTING.md](./CONTRIBUTING.md). How to add a new chain or chain type.
- [ARCHITECTURE.md](./ARCHITECTURE.md). How each chain detects burns vs relays, the relay-to-burn reverse lookup, the CCTP V2 message format, external API usage.
- [TEST_CASES.md](./TEST_CASES.md). Real burns used to validate the explorer.
- [SorobanGotcha.md](./SorobanGotcha.md). Soroban RPC quirks discovered during build.
