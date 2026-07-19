import { useQuery } from "@tanstack/react-query";
import { WifiOff } from "lucide-react";
import * as React from "react";
import { ServerSettingsCard } from "@/components/server-settings";
import { Spinner } from "@/components/ui/spinner";
import { backend } from "@/lib/api/backend";
import { getServerConfig } from "@/lib/api/http";
import { LoginForm } from "@/pages/login";
import { SetupForm } from "@/pages/setup";

/**
 * The unauthenticated experience. Asks the backend whether this instance has
 * an owner yet: first run → setup, otherwise → login. One decision, so the
 * self-hosted founder never sees a login box for an account that can't exist.
 *
 * If the backend is unreachable (fresh install pointed at localhost with no
 * local stack), surface that and offer the agency-server form — connecting
 * to a hosted Relay must be possible before any account exists.
 */
export function AuthFlow() {
  const [showServer, setShowServer] = React.useState(false);
  const status = useQuery({
    queryKey: ["auth-status"],
    queryFn: backend.auth.status,
    retry: 1,
  });

  return (
    <div className="grid min-h-screen place-items-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <img src="/relay-logo.png" alt="" className="size-9" />
          <div>
            <div className="font-semibold leading-tight">Relay</div>
            <div className="text-xs text-muted-foreground">
              operating system for software teams
            </div>
          </div>
        </div>

        {status.isLoading ? (
          <div className="flex justify-center py-10 text-muted-foreground">
            <Spinner className="size-5" />
          </div>
        ) : status.isError ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-sm">
              <WifiOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="font-medium">Can’t reach the backend</p>
                <p className="text-xs text-muted-foreground">
                  Nothing is answering at{" "}
                  <span className="font-mono">{getServerConfig().backendUrl}</span>.
                  Start the local stack, or connect to your agency’s server below.
                </p>
              </div>
            </div>
            <ServerSettingsCard />
          </div>
        ) : showServer ? (
          <ServerSettingsCard />
        ) : status.data?.needsSetup ? (
          <SetupForm />
        ) : (
          <LoginForm />
        )}

        {!status.isLoading && !status.isError && (
          <button
            type="button"
            onClick={() => setShowServer((s) => !s)}
            className="mt-6 w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            {showServer ? "Back to sign in" : "Connect to an agency server"}
          </button>
        )}
      </div>
    </div>
  );
}
