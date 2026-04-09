# Soroban RPC Gotchas

Lessons learned from building the CCTP Explorer against Soroban RPC (v1).

---

## 1. `getEvents` topic filter format: single array, not nested arrays

The `topics` field in a `getEvents` filter must be a **single inner array** where each element matches the corresponding topic position. It is NOT an array of arrays where each sub-array represents one position.

### Wrong (returns incorrect results — silently matches events with fewer topics)

```json
{
  "topics": [
    ["AAAADwAAABBtZXNzYWdlX3JlY2VpdmVk"],
    ["*"],
    ["<nonce_xdr>"],
    ["*"]
  ]
}
```

This looks like "4 separate position filters" but the API interprets it as **4 alternative filter groups**, each with a single-element matcher. Events with fewer topics than the filter positions still match, leading to false positives (e.g., 1-topic `message_sent` events matching a 4-position filter intended for `message_received`).

### Correct

```json
{
  "topics": [
    ["AAAADwAAABBtZXNzYWdlX3JlY2VpdmVk", "*", "<nonce_xdr>", "*"]
  ]
}
```

A single inner array with 4 elements — position 0 matches topic[0], position 1 matches topic[1], etc. Use `"*"` for wildcard at a specific position.

### Our use case

We search for `message_received` events on the Stellar MessageTransmitter contract by nonce to find CCTP relay transaction hashes. The event has 4 topics:

| Position | Content | Filter |
|----------|---------|--------|
| 0 | `"message_received"` (symbol) | XDR-encoded ScSymbol |
| 1 | caller address | `"*"` (wildcard) |
| 2 | nonce (bytes32) | XDR-encoded ScBytes |
| 3 | finality threshold (u32) | `"*"` (wildcard) |

### Reference

- [Stellar docs: getEvents](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getEvents)
- [getEvents v2 proposal](https://github.com/orgs/stellar/discussions/1872) — acknowledges "topic filtering confused position with count" as a known issue in v1

---

## 2. `getEvents` scans ~10k ledgers per call

A single `getEvents` call only scans approximately 10,000 ledgers regardless of the total retention window. On Stellar testnet (1 ledger ~5s), that's about 14 hours of history per call.

If the target event is far from `startLedger`, you must **paginate using the `cursor`** from the previous response. Each subsequent call advances another ~10k ledgers.

### Practical impact

With a typical retention window of ~120k ledgers (~7 days on testnet), searching from `oldestLedger` could require 12+ paginated calls. 

### Our approach

Instead of starting from `oldestLedger`, we start from `latestLedger - 50000` (~3 days back). This covers most relay lookups in 1-5 calls, since relays typically happen within hours of the burn.

```typescript
const latest = info.sequence;
const oldest = info.oldestLedger;
const startLedger = Math.max(oldest, latest - 50000);
```

If the relay happened earlier than ~3 days ago, the lookup gracefully returns `undefined` (no relay tx hash shown, but the "Minted" status still displays from the nonce check).

---

## 3. XDR topic values must be base64-encoded `ScVal`, not raw bytes

Topic filter values in `getEvents` must be the **full XDR-encoded `ScVal`**, base64-encoded. Not just the raw value bytes.

For example, to filter for the symbol `"message_received"`:

```typescript
import { xdr } from "@stellar/stellar-sdk";

// Correct: full ScVal XDR
const filter = xdr.ScVal.scvSymbol("message_received").toXDR("base64");
// → "AAAADwAAABBtZXNzYWdlX3JlY2VpdmVk"

// Wrong: just the string or raw bytes
const wrong = Buffer.from("message_received").toString("base64");
```

The XDR includes the type discriminant (4 bytes) + length prefix (4 bytes) + value data.
