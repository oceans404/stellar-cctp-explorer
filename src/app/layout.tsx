import type { Metadata } from "next";
import { Inter, Inconsolata } from "next/font/google";
import "@stellar/design-system/build/styles.min.css";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { AppHeader } from "@/components/AppHeader";
import { NetworkBanner } from "@/components/NetworkBanner";
import { Layout } from "@stellar/design-system";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const inconsolata = Inconsolata({
  variable: "--font-inconsolata",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Stellar CCTP Explorer",
    template: "%s | Stellar CCTP Explorer",
  },
  description:
    "Track USDC transfers through Circle's CCTP involving Stellar. Paste a tx hash, decode CCTP messages, and check fees.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${inconsolata.variable}`}>
      <body>
        <Providers>
          <NetworkBanner />
          <AppHeader />
          <Layout.Content>
            <Layout.Inset>{children}</Layout.Inset>
          </Layout.Content>
          <Layout.Footer
            gitHubLink="https://github.com/oceans404/stellar-cctp-explorer"
            gitHubLabel="GitHub"
          />
        </Providers>
      </body>
    </html>
  );
}
