"use client";

import { Select } from "@stellar/design-system";
import { useNetwork } from "@/context/network";
import type { NetworkName } from "@/lib/types";

export function NetworkSwitcher() {
  const { network, setNetwork } = useNetwork();

  return (
    <div style={{ width: "7rem" }}>
      <Select
        id="network-switcher"
        fieldSize="sm"
        value={network}
        onChange={(e) => setNetwork(e.target.value as NetworkName)}
      >
        <option value="testnet">Testnet</option>
        <option value="mainnet" disabled>Mainnet (coming soon)</option>
      </Select>
    </div>
  );
}
