"use client";

import { useEffect } from "react";
import { Alert, Button } from "@stellar/design-system";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", padding: "2rem 0" }}>
      <Alert variant="error" placement="inline">
        Something went wrong. {error.message || "An unexpected error occurred."}
      </Alert>
      <div>
        <Button variant="secondary" size="md" onClick={() => unstable_retry()}>
          Try again
        </Button>
      </div>
    </div>
  );
}
