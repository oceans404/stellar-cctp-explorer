"use client";

import Link from "next/link";
import { Alert, Button } from "@stellar/design-system";

export default function NotFound() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", padding: "2rem 0" }}>
      <Alert variant="warning" placement="inline">
        Page not found. The page you&apos;re looking for doesn&apos;t exist.
      </Alert>
      <div>
        <Link href="/">
          <Button variant="secondary" size="md">
            Go home
          </Button>
        </Link>
      </div>
    </div>
  );
}
