import * as React from "react";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/auth";
import { AuthFlow } from "@/pages/auth-flow";

/** Splits the app into: booting → auth screens → the product. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-muted-foreground">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (status === "unauthed") {
    return <AuthFlow />;
  }

  return <>{children}</>;
}
