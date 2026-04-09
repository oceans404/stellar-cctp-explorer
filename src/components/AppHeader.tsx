"use client";

import { useState, useEffect } from "react";
import { Layout } from "@stellar/design-system";
import { NetworkSwitcher } from "./NetworkSwitcher";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function AppHeader() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    // Render a static placeholder to avoid hydration mismatch
    // from the SDS ThemeSwitch reading localStorage on mount
    return (
      <div className="Layout__header">
        <Layout.Inset>
          <div className="Layout__header--content" />
        </Layout.Inset>
      </div>
    );
  }

  return (
    <Layout.Header
      projectId="stellar-cctp-explorer"
      projectTitle="CCTP Explorer"
      hasThemeSwitch
      contentCenter={<NavLinks />}
      contentRight={<NetworkSwitcher />}
    />
  );
}

function NavLinks() {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Home" },
    { href: "/decode", label: "Decoder" },
  ];

  return (
    <nav className="NavLinks">
      {links.map(({ href, label }) => {
        const isActive =
          href === "/" ? pathname === "/" : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            className={isActive ? "NavLinks__active" : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
