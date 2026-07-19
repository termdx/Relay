import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, Bot, KeyRound, Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "@/lib/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SectionHead } from "@/components/section-head";
import { EmptyState, ErrorState } from "@/components/states";
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
import { PasswordInput } from "@/components/ui/password-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { runtime, RuntimeError } from "@/lib/api/runtime";
import { useRuntimeWorkspace } from "@/lib/runtime-workspace";

const PROVIDERS = [
  "gemini",
  "huggingface",
  "openai",
  "anthropic",
  "openrouter",
  "ollama",
  "litellm",
];
// Providers authenticated by an API key (vs. a local endpoint).
const KEYED = new Set(["gemini", "huggingface", "openai", "anthropic", "openrouter"]);
// Providers that also need a base URL/endpoint.
const ENDPOINTED = new Set(["ollama", "litellm"]);

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
        <div className="space-y-2" aria-hidden="true">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : providers.isError ? (
        <ErrorState
          title="Couldn't load providers"
          onRetry={() => providers.refetch()}
        />
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
              isDefault={p.isDefault}
              soleProvider={providers.data.length === 1}
              onChanged={invalidate}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Bot}
          title="No providers yet"
          description="Add Gemini, OpenAI, or a local Ollama — drafts, chat, and agents route through it."
          action={
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="size-4" />
              Add provider
            </Button>
          }
        />
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

interface ProbeResult {
  status: string;
  detail?: string;
  models?: string[];
}

function ProviderRow({
  cwd,
  id,
  provider,
  defaultModel,
  hasApiKey,
  isDefault,
  soleProvider,
  onChanged,
}: {
  cwd: string;
  id: string;
  provider: string;
  defaultModel?: string;
  hasApiKey: boolean;
  isDefault: boolean;
  soleProvider: boolean;
  onChanged: () => void;
}) {
  const [confirmRemove, setConfirmRemove] = React.useState(false);
  const [probe, setProbe] = React.useState<ProbeResult | null>(null);

  const setDefault = useMutation({
    mutationFn: () => runtime.ai.setDefault(cwd, id),
    onSuccess: () => {
      toast.success(`"${id}" is now the default for Relay AI`);
      onChanged();
    },
    onError: (e) =>
      toast.error(e instanceof RuntimeError ? e.message : "Could not set default"),
  });

  const health = useMutation({
    mutationFn: () => runtime.ai.health(cwd, id),
    onSuccess: (h) => {
      // Persist the result on the row — a toast alone vanishes in 4 s.
      setProbe(h);
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
      onChanged();
    },
    onError: (e) => toast.error(e instanceof RuntimeError ? e.message : "Remove failed"),
  });

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="font-mono text-sm font-medium">{id}</span>
        <span className="text-xs text-muted-foreground">{provider}</span>
        {isDefault && <Badge variant="primary">default</Badge>}
        {defaultModel && (
          <span className="truncate text-xs text-muted-foreground">
            · {defaultModel}
          </span>
        )}
        {hasApiKey && (
          <Badge variant="outline" className="gap-1">
            <KeyRound className="size-3" />
            key
          </Badge>
        )}
        {probe && (
          <Badge
            variant={probe.status === "ok" ? "success" : probe.status === "error" ? "destructive" : "warning"}
            title={probe.detail}
          >
            {probe.status === "ok"
              ? `ok${probe.models?.length ? ` · ${probe.models.length} models` : ""}`
              : (probe.detail ?? probe.status)}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-1">
        {!isDefault && !soleProvider && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDefault.mutate()}
            disabled={setDefault.isPending}
          >
            {setDefault.isPending ? <Spinner className="size-4" /> : null}
            Make default
          </Button>
        )}
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
          onClick={() => setConfirmRemove(true)}
          disabled={remove.isPending}
          aria-label={`Remove ${id}`}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={`Remove "${id}"?`}
        description="Drafts, chat, and agents using this provider stop working until you add another."
        confirmLabel="Remove provider"
        destructive
        onConfirm={() => remove.mutate()}
      />
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
  const showKey = needsKey || provider === "litellm"; // litellm key is optional
  const showEndpoint = ENDPOINTED.has(provider);
  const endpointRequired = provider === "litellm";
  const canSubmit = (!needsKey || !!apiKey) && (!endpointRequired || !!endpoint);

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

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!add.isPending && canSubmit) add.mutate();
  }

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
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="provider">Provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger id="provider">
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
          {showKey && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="key">
                API key{provider === "litellm" ? " (optional)" : ""}
              </Label>
              <PasswordInput
                id="key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="From the provider's console"
                autoFocus
              />
            </div>
          )}
          {showEndpoint && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="endpoint">
                Endpoint{endpointRequired ? "" : " (optional)"}
              </Label>
              <Input
                id="endpoint"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder={
                  provider === "ollama"
                    ? "http://localhost:11434"
                    : "http://localhost:4000"
                }
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="model">Default model (optional)</Label>
            <Input
              id="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              list={provider === "huggingface" ? "hf-model-suggestions" : undefined}
              placeholder={
                provider === "gemini"
                  ? "gemini-flash-latest"
                  : provider === "huggingface"
                    ? "meta-llama/Llama-3.3-70B-Instruct"
                    : ""
              }
            />
            {provider === "huggingface" && (
              <>
                <datalist id="hf-model-suggestions">
                  <option value="meta-llama/Llama-3.3-70B-Instruct" />
                  <option value="Qwen/Qwen2.5-72B-Instruct" />
                  <option value="mistralai/Mistral-Small-24B-Instruct-2501" />
                  <option value="deepseek-ai/DeepSeek-V3" />
                  <option value="microsoft/phi-4" />
                </datalist>
                <p className="text-xs text-muted-foreground">
                  The HF catalog is unbounded — type any hosted model id
                  (suggestions above). Powers drafts, chat, and embeddings;
                  agents still run on Gemini.
                </p>
              </>
            )}
          </div>
          {needsKey && (
            <p className="flex items-start gap-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              A hosted provider means your data leaves this machine.
            </p>
          )}
          <DialogFooter>
            <Button
              type="submit"
              disabled={add.isPending || !canSubmit}
            >
              {add.isPending ? <Spinner className="size-4" /> : <Plus className="size-4" />}
              Add provider
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
