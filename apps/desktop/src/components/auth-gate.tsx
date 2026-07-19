import * as React from "react";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/auth";
import { AuthFlow } from "@/pages/auth-flow";

/** Splits the app into: booting → auth screens → the product. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <div
        role="status"
        className="flex h-screen flex-col items-center justify-center gap-4 bg-background text-muted-foreground"
      >
        <img src="/relay-logo.png" alt="" className="size-10" />
        <div className="flex items-center gap-2.5 text-sm">
          <Spinner className="size-4" />
          Restoring your session…
        </div>
      </div>
    );
  }

  if (status === "unauthed") {
    return <AuthFlow />;
  }

  return <>{children}</>;
}
