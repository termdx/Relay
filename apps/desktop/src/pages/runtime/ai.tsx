import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, KeyRound, Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { runtime, RuntimeError } from "@/lib/api/runtime";
import { useRuntimeWorkspace } from "@/lib/runtime-workspace";

const PROVIDERS = ["gemini", "openai", "anthropic", "ollama", "openrouter"];
const KEYED = new Set(["gemini", "openai", "anthropic", "openrouter"]);

export function RuntimeAiPage() {
  const { root } = useRuntimeWorkspace();
  const cwd = root!;
  const queryClient = useQueryClient();
  const [adding, setAdding] = React.useState(false);

  const providers = useQuery({
    queryKey: ["ai", cwd],
    queryFn: () => runtime.ai.list(cwd),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["ai", cwd] });

  return (
    <div className="mx-auto max-w-3xl">
      <SectionHead
        title="AI providers"
        subtitle="Bring your own model. Hosted or local — the runtime routes to it."
        action={
          <Button onClick={() => setAdding(true)}>
            <Plus className="size-4" />
            Add provider
          </Button>
        }
      />

      {providers.isLoading ? (
        <Spinner className="size-5" />
      ) : providers.data && providers.data.length > 0 ? (
        <div className="space-y-2">
          {providers.data.map((p) => (
            <ProviderRow
              key={p.id}
              cwd={cwd}
              id={p.id}
              provider={p.provider}
              defaultModel={p.defaultModel}
              hasApiKey={p.hasApiKey}
              onRemoved={invalidate}
            />
          ))}
        </div>
      ) : (
        <Empty>No providers yet. Add Gemini, OpenAI, or a local Ollama.</Empty>
      )}

      <AddProviderDialog
        cwd={cwd}
        open={adding}
        onOpenChange={setAdding}
        onAdded={invalidate}
      />
    </div>
  );
}

function ProviderRow({
  cwd,
  id,
  provider,
  defaultModel,
  hasApiKey,
  onRemoved,
}: {
  cwd: string;
  id: string;
  provider: string;
  defaultModel?: string;
  hasApiKey: boolean;
  onRemoved: () => void;
}) {
  const health = useMutation({
    mutationFn: () => runtime.ai.health(cwd, id),
    onSuccess: (h) => {
      if (h.status === "ok")
        toast.success(
          `${id}: ok${h.models?.length ? ` — ${h.models.length} models` : ""}`,
        );
      else if (h.status === "error") toast.error(`${id}: ${h.detail}`);
      else toast.info(`${id}: ${h.detail ?? "unknown"}`);
    },
    onError: (e) => toast.error(e instanceof RuntimeError ? e.message : "Probe failed"),
  });

  const remove = useMutation({
    mutationFn: () => runtime.ai.remove(cwd, id),
    onSuccess: () => {
      toast.success(`Removed "${id}"`);
      onRemoved();
    },
    onError: (e) => toast.error(e instanceof RuntimeError ? e.message : "Remove failed"),
  });

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-sm font-medium">{id}</span>
        <span className="text-xs text-muted-foreground">{provider}</span>
        {defaultModel && (
          <span className="text-xs text-muted-foreground">· {defaultModel}</span>
        )}
        {hasApiKey && (
          <Badge variant="outline" className="gap-1">
            <KeyRound className="size-3" />
            key
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => health.mutate()}
          disabled={health.isPending}
        >
          {health.isPending ? <Spinner className="size-4" /> : <Activity className="size-4" />}
          Health
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => remove.mutate()}
          disabled={remove.isPending}
          aria-label={`Remove ${id}`}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function AddProviderDialog({
  cwd,
  open,
  onOpenChange,
  onAdded,
}: {
  cwd: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdded: () => void;
}) {
  const [provider, setProvider] = React.useState("gemini");
  const [apiKey, setApiKey] = React.useState("");
  const [endpoint, setEndpoint] = React.useState("");
  const [model, setModel] = React.useState("");
  const needsKey = KEYED.has(provider);

  const add = useMutation({
    mutationFn: () =>
      runtime.ai.add({
        cwd,
        provider,
        apiKey: apiKey || undefined,
        endpoint: endpoint || undefined,
        defaultModel: model || undefined,
      }),
    onSuccess: (p) => {
      toast.success(`Installed "${p.id}"`);
      onAdded();
      onOpenChange(false);
      setApiKey("");
      setEndpoint("");
      setModel("");
    },
    onError: (e) => toast.error(e instanceof RuntimeError ? e.message : "Add failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add AI provider</DialogTitle>
          <DialogDescription>
            {needsKey
              ? "The key is stored in the workspace secrets — never in a manifest."
              : "Local provider — no key leaves your machine."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {needsKey ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="key">API key</Label>
              <Input
                id="key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoFocus
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="endpoint">Endpoint</Label>
              <Input
                id="endpoint"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="http://localhost:11434"
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="model">Default model (optional)</Label>
            <Input
              id="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={provider === "gemini" ? "gemini-flash-latest" : ""}
            />
          </div>
          {needsKey && (
            <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-[--color-warning]">
              ⚠ A hosted provider means your data leaves this machine.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={() => add.mutate()}
            disabled={add.isPending || (needsKey && !apiKey)}
          >
            {add.isPending ? <Spinner className="size-4" /> : <Plus className="size-4" />}
            Add provider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SectionHead({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
