import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, PackageOpen, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "@/lib/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SectionHead } from "@/components/section-head";
import { EmptyState, ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { runtime, RuntimeError } from "@/lib/api/runtime";
import { useRuntimeWorkspace } from "@/lib/runtime-workspace";

export function RuntimeModulesPage() {
  const { root } = useRuntimeWorkspace();
  const cwd = root!;
  const queryClient = useQueryClient();
  // Track WHICH row is busy — one shared isPending would freeze every button.
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [removeId, setRemoveId] = React.useState<string | null>(null);

  const installed = useQuery({
    queryKey: ["modules", cwd],
    queryFn: () => runtime.modules.list(cwd),
  });
  const catalog = useQuery({
    queryKey: ["modules-catalog", cwd],
    queryFn: () => runtime.modules.catalog(cwd),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["modules", cwd] });
    queryClient.invalidateQueries({ queryKey: ["modules-catalog", cwd] });
  };

  const install = useMutation({
    mutationFn: (id: string) => runtime.modules.add(cwd, id, true),
    onMutate: (id) => setPendingId(id),
    onSettled: () => setPendingId(null),
    onSuccess: (plan) => {
      toast.success(`Installed: ${plan.order.join(", ")}`);
      if (plan.missingIntegrations.length)
        toast.warning(
          `Needs integrations: ${plan.missingIntegrations.join(", ")} — connect them on the Integrations tab.`,
        );
      if (plan.missingAiCapabilities.length)
        toast.warning(
          `Needs AI capabilities: ${plan.missingAiCapabilities.join(", ")} — add a provider on the AI tab.`,
        );
      invalidate();
    },
    onError: (e) => toast.error(e instanceof RuntimeError ? e.message : "Install failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => runtime.modules.remove(cwd, id),
    onMutate: (id) => setPendingId(id),
    onSettled: () => setPendingId(null),
    onSuccess: (_r, id) => {
      toast.success(`Removed "${id}"`);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof RuntimeError ? e.message : "Remove failed"),
  });

  const installedIds = new Set(installed.data?.map((m) => m.id));
  const available = catalog.data?.filter((m) => !installedIds.has(m.id)) ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <SectionHead
        title="Modules"
        subtitle="Install only what this workspace needs. Dependencies resolve automatically."
      />

      <div className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Installed
        </div>
        {installed.isLoading ? (
          <div className="space-y-2" aria-hidden="true">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-13 w-full" />
            ))}
          </div>
        ) : installed.isError ? (
          <ErrorState
            title="Couldn't load installed modules"
            onRetry={() => installed.refetch()}
          />
        ) : installed.data && installed.data.length > 0 ? (
          installed.data.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
            >
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-sm font-medium">{m.id}</span>
                <span className="text-xs text-muted-foreground">v{m.version}</span>
                {m.dependencies.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    needs {m.dependencies.join(", ")}
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setRemoveId(m.id)}
                disabled={pendingId === m.id}
                aria-label={`Remove ${m.id}`}
              >
                {pendingId === m.id ? (
                  <Spinner className="size-4" />
                ) : (
                  <Trash2 className="size-4" />
                )}
              </Button>
            </div>
          ))
        ) : (
          <EmptyState
            icon={PackageOpen}
            title="Nothing installed yet"
            description="Pick modules from the catalog below — dependencies resolve automatically."
          />
        )}
      </div>

      {catalog.isError && (
        <div className="mt-6">
          <ErrorState
            title="Couldn't load the module catalog"
            onRetry={() => catalog.refetch()}
          />
        </div>
      )}

      {available.length > 0 && (
        <div className="mt-6 space-y-2">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Available
          </div>
          {available.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
            >
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-sm">{m.id}</span>
                {m.displayName && (
                  <span className="text-xs text-muted-foreground">
                    {m.displayName}
                  </span>
                )}
                {m.dependencies.length > 0 && (
                  <Badge variant="outline">+ {m.dependencies.join(", ")}</Badge>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => install.mutate(m.id)}
                disabled={pendingId !== null}
              >
                {pendingId === m.id ? (
                  <Spinner className="size-4" />
                ) : (
                  <Download className="size-4" />
                )}
                Install
              </Button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={removeId !== null}
        onOpenChange={(open) => !open && setRemoveId(null)}
        title={`Remove "${removeId}"?`}
        description="Anything the module provided stops working in this workspace. Installed files stay on disk."
        confirmLabel="Remove module"
        destructive
        onConfirm={() => {
          if (removeId) remove.mutate(removeId);
          setRemoveId(null);
        }}
      />
    </div>
  );
}
