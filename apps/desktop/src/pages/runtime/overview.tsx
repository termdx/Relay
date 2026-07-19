import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Play, Square, XCircle } from "lucide-react";
import { toast } from "@/lib/toast";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { runtime, RuntimeError } from "@/lib/api/runtime";
import { useRuntimeWorkspace } from "@/lib/runtime-workspace";
import { cn } from "@/lib/utils";
import { Server } from "lucide-react";

export function RuntimeOverviewPage() {
  const { root } = useRuntimeWorkspace();
  const cwd = root!;
  const queryClient = useQueryClient();

  const health = useQuery({
    queryKey: ["health", cwd],
    queryFn: () => runtime.health(cwd),
    refetchInterval: 4000,
  });
  const diagnostics = useQuery({
    queryKey: ["validate", cwd],
    queryFn: () => runtime.validate(cwd),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["health", cwd] });
    queryClient.invalidateQueries({ queryKey: ["validate", cwd] });
  };

  const up = useMutation({
    mutationFn: () => runtime.stack.up(cwd),
    onSuccess: (r) => {
      toast.success(`Stack starting: ${r.services.join(", ")}`);
      refresh();
    },
    onError: (e) => toast.error(e instanceof RuntimeError ? e.message : "Start failed"),
  });
  const down = useMutation({
    mutationFn: () => runtime.stack.down(cwd),
    onSuccess: () => {
      toast.success("Stack stopped");
      refresh();
    },
    onError: (e) => toast.error(e instanceof RuntimeError ? e.message : "Stop failed"),
  });

  const env = health.data?.environment;
  const services = health.data?.services ?? [];
  const anyRunning = services.some((s) => s.state === "running");
  const allRunning = services.length > 0 && services.every((s) => s.state === "running");
  const busy = up.isPending || down.isPending;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Environment, services, and workspace integrity.
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => down.mutate()}
            disabled={busy || !anyRunning}
          >
            {down.isPending ? <Spinner className="size-4" /> : <Square className="size-4" />}
            {down.isPending ? "Stopping…" : "Stop"}
          </Button>
          <Button onClick={() => up.mutate()} disabled={busy || allRunning}>
            {up.isPending ? <Spinner className="size-4" /> : <Play className="size-4" />}
            {up.isPending ? "Starting…" : "Start stack"}
          </Button>
        </div>
      </div>

      {health.isLoading ? (
        <LoadingState label="Checking the environment…" />
      ) : health.isError ? (
        <ErrorState
          title="Couldn't read stack health"
          description="Is the runtime daemon still running?"
          onRetry={refresh}
        />
      ) : (
        <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Check label="Docker CLI" ok={env?.dockerCli.ok} detail={env?.dockerCli.detail} />
            <Check label="Docker daemon" ok={env?.dockerDaemon.ok} detail={env?.dockerDaemon.detail} />
            <Check label="Compose" ok={env?.compose.ok} detail={env?.compose.detail} />
          </section>

          <section>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Services
            </div>
            {services.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Service</th>
                      <th className="px-4 py-2.5 font-medium">State</th>
                      <th className="px-4 py-2.5 text-right font-medium">Health</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((s) => (
                      <tr key={s.service} className="border-b border-border last:border-0">
                        <td className="px-4 py-2.5 font-mono">{s.service}</td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-2 text-muted-foreground">
                            <span
                              className={cn(
                                "size-1.5 rounded-full",
                                s.state === "running" ? "bg-success" : "bg-muted-foreground",
                              )}
                            />
                            {s.state}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {s.health && (
                            <Badge
                              variant={
                                s.health === "healthy"
                                  ? "success"
                                  : s.health === "unhealthy"
                                    ? "destructive"
                                    : "warning"
                              }
                            >
                              {s.health}
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={Server}
                title="Nothing running"
                description="Start the stack to bring the backend, runtime, and database up."
                action={
                  <Button size="sm" onClick={() => up.mutate()} disabled={busy}>
                    {up.isPending ? <Spinner className="size-4" /> : <Play className="size-4" />}
                    Start stack
                  </Button>
                }
              />
            )}
          </section>

          {diagnostics.data && diagnostics.data.length > 0 && (
            <section>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Diagnostics
              </div>
              <div className="space-y-1.5">
                {diagnostics.data.map((d) => (
                  <div
                    key={d.code}
                    className={cn(
                      "rounded-md border border-l-4 bg-card px-3 py-2 text-sm",
                      d.level === "error" ? "border-l-destructive" : "border-l-warning",
                    )}
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      {d.code}
                    </span>{" "}
                    {d.message}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Check({
  label,
  ok,
  detail,
}: {
  label: string;
  ok?: boolean;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        {ok === undefined ? (
          <Spinner className="size-4 text-muted-foreground" />
        ) : ok ? (
          <CheckCircle2 className="size-4 text-success" />
        ) : (
          <XCircle className="size-4 text-destructive" />
        )}
        <span className="text-sm font-medium">{label}</span>
      </div>
      {detail && (
        <p className="mt-1 truncate text-xs text-muted-foreground" title={detail}>
          {detail}
        </p>
      )}
    </div>
  );
}
