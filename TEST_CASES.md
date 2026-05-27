# CCTP Explorer Test Cases

Real transfers used to validate the explorer end-to-end against both Iris API tiers.

---

## Mainnet

### Stellar -> Solana (20 USDC) — 2026-05-27

| Field | Value |
|---|---|
| Direction | Stellar -> Solana |
| Amount | 20.00 USDC |
| Source domain | 27 (Stellar) |
| Dest domain | 5 (Solana) |
| CCTP version | 2 |
| Transfer type | Standard (self-relay, `minFinalityThreshold: 2000`) |
| Stellar burn tx | `61b3aeca44ab663052ae894233004fb58cc96d89738b48a14de21df9fa16724e` |
| Solana relay tx | `64Qwu8BZkXJq3UxSZcCWR15qhXT3FeTBEVVmayzsSFF3HKVHVo1aoyFkhQyAkmL3SbPfcoDcA1vVTVQhX9Ahz3bA` |
| Nonce | `0xbc36526d041ff6cb5836a9b5510941bb0cbdf65cbd1a05886f9bc5935b013796` |
| Block / Timestamp | 62762418 / 2026-05-27T17:38:21Z |
| Attestation | `complete`, finality 2000/2000 |
| Recipient (Solana program) | `CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe` |
| Notes | Validates burn detection, Iris prod attestation, Solana nonce PDA lookup, decoded message body. |

Curl recipe:

```bash
curl -s "http://localhost:3000/api/transfer/27/61b3aeca44ab663052ae894233004fb58cc96d89738b48a14de21df9fa16724e?network=mainnet" | jq
```

---

## Testnet

### Stellar -> Solana (0.5 USDC) — 2026-04-08

| Field | Value |
|---|---|
| Direction | Stellar -> Solana |
| Amount | 0.5 USDC |
| Source / Dest domain | 27 -> 5 |
| Method | `deposit_for_burn_with_hook` -> `receiveMessage` |
| Stellar burn tx | `bba1566cc5a18347f6138c867c6907a975713e627cdee1d5d691202cd54102c9` |
| Solana relay tx | `4BYM2ubSwR6Ati78CYJwzQSzcNcES8NHhW3xYmjkWw7jYxS1soKnSi65ATH5WDZW87WBdaNdrCBKjWknH9uBA83L` |
| Nonce | `9a46507548f80fea9e3764a29634ed976a565dc6004fc9d18ec29444b679489b` |
| Stellar sender | `GAEAXIPPZXWGYRV4LO3WOO6TMUNVF32B4NQLZRQAVCTLXBAIVOQWK2HX` |
| Solana receiver wallet | `EHrxPrT9ugvXousvHJ5Gd6L2mLzWzTNFZ6hqkrS6qbrV` |
| Solana receiver ATA | `9RsLMMwqmqELjvmmA2rpgJetZmUhKuqoSAdUWy4ZoBLY` |
| Dest caller | `0x00...00` (permissionless) |
| ALT | `246Gs7V4EQR8QDBiEPUW812A4qBmi52J34J7uX8Fe4nN` (12 addresses, required for 20-account `receiveMessage`) |
| Notes | Required USDC allowance approval on Stellar before burn. |

### Solana -> Stellar (0.5 USDC) — 2026-04-08

| Field | Value |
|---|---|
| Direction | Solana -> Stellar |
| Amount | 0.5 USDC |
| Source / Dest domain | 5 -> 27 |
| Method | `depositForBurnWithHook` -> `mint_and_forward` |
| Solana burn tx | `2QLNm5Am7Bu1EeqFGKdDtWky2uRBbXiNTqg5Z1xejdPQjMLRaccfDwoTQ2DuqzM8twdjmWc3URE6e9RqYc8B1yyz` |
| Stellar mint tx | `6c349d57cb26791487059eaae91575370e9a526efdb008c9087ac451f94acb86` |
| Nonce | `f182c5440fdb10bf56efaac7b69d3db9103d37aff25b52bf06589353e8586e9a` |
| Solana sender wallet | `EHrxPrT9ugvXousvHJ5Gd6L2mLzWzTNFZ6hqkrS6qbrV` |
| Stellar receiver | `GAEAXIPPZXWGYRV4LO3WOO6TMUNVF32B4NQLZRQAVCTLXBAIVOQWK2HX` |
| Mint recipient = Dest caller | `3de86ac50b47eaf2840fe23e48179551660fd1072fba6f445d4a6bd7af4ab93e` (CctpForwarder) |
| Burn token (Solana USDC) | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |
| CctpForwarder | `CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ` |
| Notes | Solana burn fits in a single tx (924 bytes, no ALT). Each burn needs a fresh `messageSentEventData` keypair. |

---

## Iris endpoints

| Network | Base URL |
|---|---|
| Mainnet | `https://iris-api.circle.com/v2/messages/{sourceDomain}` |
| Testnet | `https://iris-api-sandbox.circle.com/v2/messages/{sourceDomain}` |

Both accept `?transactionHash={hash}` (forward lookup) or `?nonce={nonce}` (reverse).

## Validation checklist (per case)

- [ ] Look up by source tx hash
- [ ] Correct source/dest domain and amount
- [ ] Sender/recipient rendered in human-readable format
- [ ] Explorer links for source + relay
- [ ] Attestation status progresses (pending -> complete)
- [ ] `CctpForwarder` pattern handled when present
- [ ] `receive_message` (Stellar) vs `mint_and_forward` (forwarder route) distinguished
