"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Input, Select, Button } from "@stellar/design-system";
import { useNetwork } from "@/context/network";
import { detectChainFromHash } from "@/lib/utils";

// Map chain type → default slug suggestions
const CHAIN_SUGGESTIONS: Record<string, string> = {
  evm: "ethereum-sepolia",
  stellar: "stellar-testnet",
  solana: "solana-devnet",
};

export function SearchBar() {
  const router = useRouter();
  const { config, network } = useNetwork();

  const chains = Object.values(config.chains).filter((c) => c.enabled);
  const [chainSlug, setChainSlug] = useState(chains[0]?.slug ?? "");
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");

  const handleHashChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.trim();
      setTxHash(value);
      setError("");

      if (value.length >= 10) {
        const detected = detectChainFromHash(value);
        const suggested = CHAIN_SUGGESTIONS[detected];
        if (suggested && config.chains[suggested]?.enabled) {
          setChainSlug(suggested);
        }
      }
    },
    [config.chains]
  );

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();

      if (!txHash) {
        setError("Enter a transaction hash");
        return;
      }
      if (!chainSlug) {
        setError("Select a source chain");
        return;
      }

      const hashPattern = /^(0x)?[0-9a-fA-F]{64}$/;
      const solanaPattern = /^[1-9A-HJ-NP-Za-km-z]{32,88}$/;
      if (!hashPattern.test(txHash) && !solanaPattern.test(txHash)) {
        setError("Invalid transaction hash format");
        return;
      }

      router.push(`/tx/${chainSlug}/${txHash}?network=${network}`);
    },
    [txHash, chainSlug, network, router]
  );

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}
    >
      <div style={{ minWidth: "180px" }}>
        <Select
          id="chain-select"
          fieldSize="md"
          label="Source chain"
          value={chainSlug}
          onChange={(e) => setChainSlug(e.target.value)}
        >
          {chains.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      <div style={{ flex: 1, minWidth: "300px" }}>
        <Input
          id="tx-hash-input"
          fieldSize="md"
          label="Transaction hash"
          placeholder="Paste a transaction hash (0x... or 64-char hex)"
          value={txHash}
          onChange={handleHashChange}
          isError={!!error}
          error={error}
        />
      </div>

      <Button variant="primary" size="md" type="submit">
        Track
      </Button>
    </form>
  );
}
