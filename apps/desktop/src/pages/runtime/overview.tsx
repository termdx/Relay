import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Play, Square, XCircle } from "lucide-react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { runtime, RuntimeError } from "@/lib/api/runtime";
import { useRuntimeWorkspace } from "@/lib/runtime-workspace";

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

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Overview</h2>
          <p className="text-sm text-muted-foreground">
            Environment, services, and workspace integrity.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => down.mutate()}
            disabled={down.isPending}
          >
            {down.isPending ? <Spinner className="size-4" /> : <Square className="size-4" />}
            Stop
          </Button>
          <Button onClick={() => up.mutate()} disabled={up.isPending}>
            {up.isPending ? <Spinner className="size-4" /> : <Play className="size-4" />}
            Start stack
          </Button>
        </div>
      </div>

      <section className="grid grid-cols-3 gap-3">
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
              <tbody>
                {services.map((s) => (
                  <tr key={s.service} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-mono">{s.service}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{s.state}</td>
                    <td className="px-4 py-2.5 text-right">
                      {s.health && (
                        <Badge variant={s.health === "healthy" ? "success" : "warning"}>
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
          <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            Nothing running. Click <span className="font-medium">Start stack</span>.
          </div>
        )}
      </section>

      {diagnostics.data && diagnostics.data.length > 0 && (
        <section>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Diagnostics
          </div>
          <div className="space-y-1.5">
            {diagnostics.data.map((d, i) => (
              <div
                key={i}
                className={`rounded-md border border-l-4 bg-card px-3 py-2 text-sm ${
                  d.level === "error" ? "border-l-destructive" : "border-l-[--color-warning]"
                }`}
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
          <CheckCircle2 className="size-4 text-[--color-success]" />
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
