"use client";

import { Banner } from "@stellar/design-system";
import { useNetwork } from "@/context/network";

export function NetworkBanner() {
  const { network } = useNetwork();

  const variant = network === "mainnet" ? "primary" : "secondary";
  const label =
    network === "mainnet"
      ? "Stellar CCTP Explorer \u2014 Mainnet"
      : "Stellar CCTP Explorer \u2014 Testnet";

  return <Banner variant={variant}>{label}</Banner>;
}
