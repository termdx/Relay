import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Plug, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  runtime,
  RuntimeError,
  type IntegrationManifest,
} from "@/lib/api/runtime";
import { useRuntimeWorkspace } from "@/lib/runtime-workspace";
import { Empty, SectionHead } from "./ai";

export function RuntimeIntegrationsPage() {
  const { root } = useRuntimeWorkspace();
  const cwd = root!;
  const queryClient = useQueryClient();
  const [adding, setAdding] = React.useState<IntegrationManifest | null>(null);

  const installed = useQuery({
    queryKey: ["integrations", cwd],
    queryFn: () => runtime.integrations.list(cwd),
  });
  const catalog = useQuery({
    queryKey: ["integrations-catalog", cwd],
    queryFn: () => runtime.integrations.catalog(cwd),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["integrations", cwd] });

  const remove = useMutation({
    mutationFn: (id: string) => runtime.integrations.remove(cwd, id),
    onSuccess: (_r, id) => {
      toast.success(`Removed "${id}"`);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof RuntimeError ? e.message : "Remove failed"),
  });

  const health = useMutation({
    mutationFn: (id: string) => runtime.integrations.health(cwd, id),
    onSuccess: (h) => {
      const bad = h.checks.filter((c) => c.status !== "ok");
      if (bad.length === 0) toast.success(`${h.id}: all checks ok`);
      else toast.error(`${h.id}: ${bad.map((c) => `${c.name} ${c.status}`).join(", ")}`);
    },
    onError: (e) => toast.error(e instanceof RuntimeError ? e.message : "Probe failed"),
  });

  const installedIds = new Set(installed.data?.map((i) => i.id));
  const available = catalog.data?.filter((i) => !installedIds.has(i.id)) ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <SectionHead
        title="Integrations"
        subtitle="Connect GitHub, Slack, and more. Credentials are stored in secrets."
      />

      <div className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Connected
        </div>
        {installed.isLoading ? (
          <Spinner className="size-5" />
        ) : installed.data && installed.data.length > 0 ? (
          installed.data.map((i) => (
            <div
              key={i.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
            >
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-sm font-medium">{i.id}</span>
                <span className="text-xs text-muted-foreground">
                  {i.displayName}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => health.mutate(i.id)}
                  disabled={health.isPending}
                >
                  <Activity className="size-4" />
                  Health
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove.mutate(i.id)}
                  disabled={remove.isPending}
                  aria-label={`Remove ${i.id}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))
        ) : (
          <Empty>No integrations connected.</Empty>
        )}
      </div>

      {available.length > 0 && (
        <div className="mt-6 space-y-2">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Available
          </div>
          {available.map((i) => (
            <div
              key={i.id}
              className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <Plug className="size-4 text-muted-foreground" />
                <span className="font-mono text-sm">{i.id}</span>
                <span className="text-xs text-muted-foreground">
                  {i.displayName}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={() => setAdding(i)}>
                Connect
              </Button>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <ConnectDialog
          cwd={cwd}
          manifest={adding}
          onOpenChange={(v) => !v && setAdding(null)}
          onConnected={() => {
            invalidate();
            setAdding(null);
          }}
        />
      )}
    </div>
  );
}

function ConnectDialog({
  cwd,
  manifest,
  onOpenChange,
  onConnected,
}: {
  cwd: string;
  manifest: IntegrationManifest;
  onOpenChange: (v: boolean) => void;
  onConnected: () => void;
}) {
  const [values, setValues] = React.useState<Record<string, string>>({});

  const connect = useMutation({
    mutationFn: () => runtime.integrations.add(cwd, manifest.id, values),
    onSuccess: () => {
      toast.success(`Connected "${manifest.id}"`);
      onConnected();
    },
    onError: (e) => toast.error(e instanceof RuntimeError ? e.message : "Connect failed"),
  });

  const missingRequired = manifest.credentials.some(
    (c) => c.required && !values[c.name],
  );

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect {manifest.displayName ?? manifest.id}</DialogTitle>
          <DialogDescription>
            Credentials are stored in the workspace secrets, never in a manifest.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {manifest.credentials.map((cred) => (
            <div key={cred.name} className="flex flex-col gap-1.5">
              <Label htmlFor={cred.name}>
                {cred.name}
                {cred.required && <span className="text-destructive"> *</span>}
              </Label>
              <Input
                id={cred.name}
                type="password"
                value={values[cred.name] ?? ""}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [cred.name]: e.target.value }))
                }
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button
            onClick={() => connect.mutate()}
            disabled={connect.isPending || missingRequired}
          >
            {connect.isPending && <Spinner className="size-4" />}
            Connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
