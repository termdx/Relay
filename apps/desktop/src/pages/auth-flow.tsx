import { useQuery } from "@tanstack/react-query";
import { Waypoints } from "lucide-react";
import { backend } from "@/lib/api/backend";
import { Spinner } from "@/components/ui/spinner";
import { LoginForm } from "@/pages/login";
import { SetupForm } from "@/pages/setup";

/**
 * The unauthenticated experience. Asks the backend whether this instance has
 * an owner yet: first run → setup, otherwise → login. One decision, so the
 * self-hosted founder never sees a login box for an account that can't exist.
 */
export function AuthFlow() {
  const status = useQuery({
    queryKey: ["auth-status"],
    queryFn: backend.auth.status,
  });

  return (
    <div className="grid min-h-screen place-items-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Waypoints className="size-5" />
          </div>
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
        ) : status.data?.needsSetup ? (
          <SetupForm />
        ) : (
          <LoginForm />
        )}
      </div>
    </div>
  );
}
