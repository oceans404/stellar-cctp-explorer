import { TransferTracker } from "@/components/TransferTracker";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ chain: string; hash: string }>;
}) {
  const { chain, hash } = await params;
  const shortHash = hash.length > 16 ? hash.slice(0, 8) + "..." + hash.slice(-6) : hash;

  return {
    title: `Track Transfer ${shortHash}`,
    description: `Track CCTP transfer ${hash} from ${chain} through the full lifecycle: burn, attestation, and relay.`,
  };
}

export default async function TransferPage({
  params,
}: {
  params: Promise<{ chain: string; hash: string }>;
}) {
  const { chain, hash } = await params;

  return <TransferTracker chainSlug={chain} txHash={hash} />;
}
