# CCTP Explorer Test Cases

Real transfers executed on testnet/devnet for validating the explorer.

---

## Solana Test Cases

### Test Case: Stellar → Solana (0.5 USDC) — 2026-04-08

| Field | Value |
|---|---|
| Direction | Stellar → Solana |
| Amount | 0.5 USDC |
| Source domain | 27 (Stellar) |
| Dest domain | 5 (Solana) |
| CCTP version | 2 |
| Transfer type | Standard (self-relay, `min_finality_threshold: 2000`) |
| Method | `deposit_for_burn_with_hook` → `receiveMessage` |
| Stellar burn tx | `bba1566cc5a18347f6138c867c6907a975713e627cdee1d5d691202cd54102c9` |
| Solana relay tx | `4BYM2ubSwR6Ati78CYJwzQSzcNcES8NHhW3xYmjkWw7jYxS1soKnSi65ATH5WDZW87WBdaNdrCBKjWknH9uBA83L` |
| Nonce | `9a46507548f80fea9e3764a29634ed976a565dc6004fc9d18ec29444b679489b` |
| Message hex | `0x000000010000001b000000059a46507548f80fea9e3764a29634ed976a565dc6004fc9d18ec29444b679489bda6f9ee0786c812344d82817ef19b648b4af120f8bd10bf658e6b99eacff24b8a65fc81d0fefa8860cb3b83f089b0224be8a6687b7ae49f594c0b9b4d7e938930000000000000000000000000000000000000000000000000000000000000000000007d0000007d00000001...` |
| Attestation status | `complete` (instant — Stellar ~5s finality) |
| Stellar sender | `GAEAXIPPZXWGYRV4LO3WOO6TMUNVF32B4NQLZRQAVCTLXBAIVOQWK2HX` |
| Solana receiver wallet | `EHrxPrT9ugvXousvHJ5Gd6L2mLzWzTNFZ6hqkrS6qbrV` |
| Solana receiver ATA | `9RsLMMwqmqELjvmmA2rpgJetZmUhKuqoSAdUWy4ZoBLY` |
| Mint recipient (bytes32) | `7d3c58e5bcdf7f31a542724f0924113f6c6083d372022742a3cabf2670c31b65` |
| Sender (bytes32) | `da6f9ee0786c812344d82817ef19b648b4af120f8bd10bf658e6b99eacff24b8` |
| Recipient (bytes32) | `a65fc81d0fefa8860cb3b83f089b0224be8a6687b7ae49f594c0b9b4d7e93893` |
| Dest caller | `0x00...00` (permissionless) |
| Hook data | Self-relay zeros + Stellar strkey (no Forwarding Service) |
| ALT used | `246Gs7V4EQR8QDBiEPUW812A4qBmi52J34J7uX8Fe4nN` (12 addresses, required for 20-account receiveMessage) |
| Fee | 0 |
| Notes | Required USDC allowance approval on Stellar before burn. |

### Test Case: Solana → Stellar (0.5 USDC) — 2026-04-08

| Field | Value |
|---|---|
| Direction | Solana → Stellar |
| Amount | 0.5 USDC |
| Source domain | 5 (Solana) |
| Dest domain | 27 (Stellar) |
| CCTP version | 2 |
| Transfer type | Standard (self-relay, `min_finality_threshold: 2000`) |
| Method | `depositForBurnWithHook` → `mint_and_forward` |
| Solana burn tx | `2QLNm5Am7Bu1EeqFGKdDtWky2uRBbXiNTqg5Z1xejdPQjMLRaccfDwoTQ2DuqzM8twdjmWc3URE6e9RqYc8B1yyz` |
| Stellar mint tx | `6c349d57cb26791487059eaae91575370e9a526efdb008c9087ac451f94acb86` |
| Nonce | `f182c5440fdb10bf56efaac7b69d3db9103d37aff25b52bf06589353e8586e9a` |
| Message hex | `0x00000001000000050000001bf182c5440fdb10bf56efaac7b69d3db9103d37aff25b52bf06589353e8586e9aa65fc81d0fefa8860cb3b83f089b0224be8a6687b7ae49f594c0b9b4d7e93893da6f9ee0786c812344d82817ef19b648b4af120f8bd10bf658e6b99eacff24b83de86ac50b47eaf2840fe23e48179551660fd1072fba6f445d4a6bd7af4ab93e000007d0000007d00000001...` |
| Attestation status | `complete` (~3s after burn confirmation) |
| Solana sender wallet | `EHrxPrT9ugvXousvHJ5Gd6L2mLzWzTNFZ6hqkrS6qbrV` |
| Solana sender ATA | `9RsLMMwqmqELjvmmA2rpgJetZmUhKuqoSAdUWy4ZoBLY` |
| Stellar receiver | `GAEAXIPPZXWGYRV4LO3WOO6TMUNVF32B4NQLZRQAVCTLXBAIVOQWK2HX` |
| Mint recipient (CctpForwarder) | `3de86ac50b47eaf2840fe23e48179551660fd1072fba6f445d4a6bd7af4ab93e` |
| Dest caller (CctpForwarder) | `3de86ac50b47eaf2840fe23e48179551660fd1072fba6f445d4a6bd7af4ab93e` |
| Burn token (Solana USDC) | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |
| Hook data | Self-relay zeros + Stellar strkey (no Forwarding Service) |
| CctpForwarder contract | `CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ` |
| Fee | 0 |
| Notes | Solana burn fits in single tx (924 bytes, no ALT needed). Each burn needs fresh `messageSentEventData` keypair. |

---

## Iris API Endpoints Used

| Direction | URL |
|---|---|
| Stellar → Solana | `https://iris-api-sandbox.circle.com/v2/messages/27?transactionHash={stellarTxHash}` |
| Solana → Stellar | `https://iris-api-sandbox.circle.com/v2/messages/5?transactionHash={solanaTxHash}` |

## Explorer Validation Checklist

- [ ] Can look up Stellar → Solana transfer by Stellar tx hash
- [ ] Can look up Solana → Stellar transfer by Solana tx hash
- [ ] Correctly parses source/dest domains (27 ↔ 5)
- [ ] Shows 0.5 USDC amount for both
- [ ] Shows correct sender/receiver addresses in human-readable format
- [ ] Links to Stellar Horizon / Solana Explorer for tx details
- [ ] Shows attestation status progression (pending → complete)
- [ ] Handles CctpForwarder pattern (Solana → Stellar uses forwarder as mint_recipient + dest_caller)
- [ ] Distinguishes `receiveMessage` (Stellar→Solana) from `mint_and_forward` (Solana→Stellar)
