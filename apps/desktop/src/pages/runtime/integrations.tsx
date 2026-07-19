import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Plug, Trash2 } from "lucide-react";
import { IntegrationIcon } from "@/components/integration-icon";
import * as React from "react";
import { toast } from "@/lib/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SectionHead } from "@/components/section-head";
import { EmptyState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  runtime,
  RuntimeError,
  type IntegrationManifest,
} from "@/lib/api/runtime";
import { openExternal } from "@/lib/open";
import { useRuntimeWorkspace } from "@/lib/runtime-workspace";

/** "client_secret" → "Client secret" */
function friendlyName(raw: string): string {
  const spaced = raw.replace(/[_-]+/g, " ").trim();
  return spaced.replace(/^\w/, (c) => c.toUpperCase());
}

export function RuntimeIntegrationsPage() {
  const { root } = useRuntimeWorkspace();
  const cwd = root!;
  const queryClient = useQueryClient();
  const [adding, setAdding] = React.useState<IntegrationManifest | null>(null);
  const [healthId, setHealthId] = React.useState<string | null>(null);
  const [removeId, setRemoveId] = React.useState<string | null>(null);

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

  // Guard against overlapping applies when several changes land in a row.
  const applying = React.useRef(false);

  /** Credentials only reach the backend when the stack regenerates — apply
   * immediately so "connected" always means "working". */
  async function applyToStack() {
    if (applying.current) return;
    applying.current = true;
    toast.loading("Applying to the stack…", { id: "stack-apply" });
    try {
      await runtime.stack.up(cwd);
      toast.success("Stack updated — the integration is live", { id: "stack-apply" });
    } catch (e) {
      toast.error(
        e instanceof RuntimeError
          ? `Connected, but applying failed: ${e.message}`
          : "Connected, but applying failed — run `relay up` manually",
        { id: "stack-apply" },
      );
    } finally {
      applying.current = false;
    }
  }

  const remove = useMutation({
    mutationFn: (id: string) => runtime.integrations.remove(cwd, id),
    onSuccess: (_r, id) => {
      toast.success(`Removed "${id}"`);
      invalidate();
      void applyToStack();
    },
    onError: (e) => toast.error(e instanceof RuntimeError ? e.message : "Remove failed"),
  });

  const health = useMutation({
    mutationFn: (id: string) => runtime.integrations.health(cwd, id),
    onMutate: (id) => setHealthId(id),
    onSettled: () => setHealthId(null),
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
          <div className="space-y-2" aria-hidden="true">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-13 w-full" />
            ))}
          </div>
        ) : installed.isError ? (
          <ErrorState
            title="Couldn't load integrations"
            onRetry={() => installed.refetch()}
          />
        ) : installed.data && installed.data.length > 0 ? (
          installed.data.map((i) => (
            <div
              key={i.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
            >
              <div className="flex items-center gap-2.5">
                <IntegrationIcon id={i.id} className="text-muted-foreground" />
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
                  disabled={healthId !== null || remove.isPending}
                >
                  {healthId === i.id ? (
                    <Spinner className="size-4" />
                  ) : (
                    <Activity className="size-4" />
                  )}
                  Health
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setRemoveId(i.id)}
                  disabled={remove.isPending}
                  aria-label={`Remove ${i.id}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))
        ) : (
          <EmptyState
            icon={Plug}
            title="No integrations connected"
            description="Connect one below — the stack restarts itself so it's live immediately."
          />
        )}
      </div>

      {catalog.isError && (
        <div className="mt-6">
          <ErrorState
            title="Couldn't load the integration catalog"
            onRetry={() => catalog.refetch()}
          />
        </div>
      )}

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
                <IntegrationIcon id={i.id} className="text-muted-foreground" />
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
            void applyToStack();
          }}
        />
      )}

      <ConfirmDialog
        open={removeId !== null}
        onOpenChange={(open) => !open && setRemoveId(null)}
        title={`Remove "${removeId}"?`}
        description="Its credentials are deleted and the stack restarts without it. You can reconnect any time."
        confirmLabel="Remove integration"
        destructive
        onConfirm={() => {
          if (removeId) remove.mutate(removeId);
          setRemoveId(null);
        }}
      />
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
  // GitHub gets the OAuth device flow; a token paste remains the fallback.
  const [useToken, setUseToken] = React.useState(manifest.id !== "github");
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

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!connect.isPending && !missingRequired) connect.mutate();
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect {manifest.displayName ?? manifest.id}</DialogTitle>
          <DialogDescription>
            Credentials are stored in the workspace secrets, never in a manifest.
          </DialogDescription>
        </DialogHeader>

        {manifest.id === "smtp" ? (
          <SmtpConnect cwd={cwd} onConnected={onConnected} />
        ) : manifest.id === "github" && !useToken ? (
          <GithubDeviceConnect
            cwd={cwd}
            onConnected={onConnected}
            onUseToken={() => setUseToken(true)}
          />
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            {manifest.credentials.map((cred) => (
              <div key={cred.name} className="flex flex-col gap-1.5">
                <Label htmlFor={cred.name}>
                  {friendlyName(cred.name)}
                  {cred.required && <span className="text-destructive"> *</span>}
                </Label>
                <PasswordInput
                  id={cred.name}
                  value={values[cred.name] ?? ""}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [cred.name]: e.target.value }))
                  }
                />
              </div>
            ))}
            <DialogFooter className="items-center">
              {manifest.id === "github" && (
                <button
                  type="button"
                  className="mr-auto rounded-sm text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setUseToken(false)}
                >
                  Use GitHub sign-in instead
                </button>
              )}
              <Button
                type="submit"
                disabled={connect.isPending || missingRequired}
              >
                {connect.isPending && <Spinner className="size-4" />}
                Connect
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface SmtpProvider {
  id: string;
  label: string;
  host?: string;
  port?: number;
  /** Username is fixed (Resend) or mirrors the key (Postmark). */
  fixedUser?: string;
  userIsKey?: boolean;
  userLabel?: string;
  userPlaceholder?: string;
  keyLabel: string;
  keyHint?: string;
  custom?: boolean;
}

const SMTP_PROVIDERS: SmtpProvider[] = [
  {
    id: "resend",
    label: "Resend",
    host: "smtp.resend.com",
    port: 465,
    fixedUser: "resend",
    keyLabel: "API key",
    keyHint: "re_… key from resend.com/api-keys",
  },
  {
    id: "gmail",
    label: "Gmail / Google Workspace",
    host: "smtp.gmail.com",
    port: 465,
    userLabel: "Gmail address",
    userPlaceholder: "you@gmail.com",
    keyLabel: "App password",
    keyHint: "Create one at myaccount.google.com/apppasswords — not your real password",
  },
  {
    id: "mailgun",
    label: "Mailgun",
    host: "smtp.mailgun.org",
    port: 465,
    userLabel: "SMTP login",
    userPlaceholder: "postmaster@mg.yourdomain.com",
    keyLabel: "SMTP password",
  },
  {
    id: "brevo",
    label: "Brevo",
    host: "smtp-relay.brevo.com",
    port: 587,
    userLabel: "Login email",
    userPlaceholder: "you@company.com",
    keyLabel: "SMTP key",
  },
  {
    id: "postmark",
    label: "Postmark",
    host: "smtp.postmarkapp.com",
    port: 587,
    userIsKey: true,
    keyLabel: "Server token",
  },
  { id: "custom", label: "Custom SMTP server", custom: true, keyLabel: "Password" },
];

/**
 * Provider-aware SMTP connect: pick a provider, paste the key — the dialog
 * composes the smtp(s):// URL itself (465 → smtps, else smtp; credentials
 * URL-encoded). Everything still lands in the same smtp.url secret.
 */
function SmtpConnect({
  cwd,
  onConnected,
}: {
  cwd: string;
  onConnected: () => void;
}) {
  const [providerId, setProviderId] = React.useState("resend");
  const [user, setUser] = React.useState("");
  const [secret, setSecret] = React.useState("");
  const [host, setHost] = React.useState("");
  const [port, setPort] = React.useState("587");
  const [from, setFrom] = React.useState("");

  const provider = SMTP_PROVIDERS.find((p) => p.id === providerId)!;

  const connect = useMutation({
    mutationFn: () => {
      const effectiveHost = provider.custom ? host.trim() : provider.host!;
      const effectivePort = provider.custom ? Number(port) : provider.port!;
      const effectiveUser = provider.fixedUser ?? (provider.userIsKey ? secret : user.trim());
      const scheme = effectivePort === 465 ? "smtps" : "smtp";
      const url = `${scheme}://${encodeURIComponent(effectiveUser)}:${encodeURIComponent(secret)}@${effectiveHost}:${effectivePort}`;
      return runtime.integrations.add(cwd, "smtp", {
        url,
        ...(from.trim() ? { from: from.trim() } : {}),
      });
    },
    onSuccess: () => {
      // onConnected applies the stack restart — no "restart it yourself" copy.
      toast.success("Email connected");
      onConnected();
    },
    onError: (e) =>
      toast.error(e instanceof RuntimeError ? e.message : "Connect failed"),
  });

  const missing =
    !secret.trim() ||
    (provider.custom && (!host.trim() || !Number(port))) ||
    (!provider.fixedUser && !provider.userIsKey && !provider.custom && !user.trim()) ||
    (provider.custom && !user.trim());

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!connect.isPending && !missing) connect.mutate();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="smtp-provider">Provider</Label>
        <Select value={providerId} onValueChange={setProviderId}>
          <SelectTrigger id="smtp-provider">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SMTP_PROVIDERS.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {provider.custom && (
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="smtp-host">Host</Label>
            <Input
              id="smtp-host"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="mail.yourserver.com"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="smtp-port">Port</Label>
            <Input
              id="smtp-port"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              inputMode="numeric"
              placeholder="587"
            />
          </div>
        </div>
      )}

      {!provider.fixedUser && !provider.userIsKey && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="smtp-user">{provider.userLabel ?? "Username"}</Label>
          <Input
            id="smtp-user"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder={provider.userPlaceholder ?? ""}
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="smtp-secret">{provider.keyLabel}</Label>
        <PasswordInput
          id="smtp-secret"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          autoComplete="off"
        />
        {provider.keyHint && (
          <p className="text-xs text-muted-foreground">{provider.keyHint}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="smtp-from">Send as</Label>
        <Input
          id="smtp-from"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          placeholder="TermDX Studio <hello@termdx.studio>"
        />
        <p className="text-xs text-muted-foreground">
          Must be an address your provider allows sending from.
        </p>
      </div>

      <DialogFooter className="items-center">
        {missing && (
          <span className="mr-auto text-xs text-muted-foreground">
            Fill in the required fields to connect.
          </span>
        )}
        <Button type="submit" disabled={connect.isPending || missing}>
          {connect.isPending && <Spinner className="size-4" />}
          Connect email
        </Button>
      </DialogFooter>
    </form>
  );
}

type DeviceFlowState =
  | { phase: "idle" }
  | { phase: "starting" }
  | {
      phase: "waiting";
      userCode: string;
      verificationUri: string;
      deviceCode: string;
      interval: number;
    };

/**
 * OAuth device flow: request a code, the user enters it on github.com, we
 * poll until GitHub confirms. The token never reaches this UI — the runtime
 * stores it and installs the integration server-side.
 */
function GithubDeviceConnect({
  cwd,
  onConnected,
  onUseToken,
}: {
  cwd: string;
  onConnected: () => void;
  onUseToken: () => void;
}) {
  const [state, setState] = React.useState<DeviceFlowState>({ phase: "idle" });
  const [clientId, setClientId] = React.useState("");
  const [needsClientId, setNeedsClientId] = React.useState(false);

  async function start() {
    setState({ phase: "starting" });
    try {
      const flow = await runtime.integrations.githubDeviceStart(
        cwd,
        clientId.trim() || undefined,
      );
      setState({
        phase: "waiting",
        userCode: flow.userCode,
        verificationUri: flow.verificationUri,
        deviceCode: flow.deviceCode,
        interval: Math.max(flow.interval, 5),
      });
    } catch (e) {
      const message = e instanceof RuntimeError ? e.message : "Could not start";
      if (message.includes("client id")) setNeedsClientId(true);
      else toast.error(message);
      setState({ phase: "idle" });
    }
  }

  // Poll while waiting; GitHub dictates the cadence.
  React.useEffect(() => {
    if (state.phase !== "waiting") return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await runtime.integrations.githubDevicePoll(
          cwd,
          state.deviceCode,
        );
        if (cancelled) return;
        if (res.status === "complete") {
          toast.success("GitHub connected");
          onConnected();
        } else if (res.status === "error") {
          toast.error(res.message ?? "Authorization failed");
          setState({ phase: "idle" });
        } else {
          // re-arm the effect (interval may have grown on slow_down)
          setState((s) =>
            s.phase === "waiting"
              ? { ...s, interval: res.interval ?? s.interval }
              : s,
          );
        }
      } catch {
        if (!cancelled) setState((s) => ({ ...s })); // retry next tick
      }
    }, state.interval * 1000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [state, cwd, onConnected]);

  if (state.phase === "waiting") {
    return (
      <div className="flex flex-col items-center gap-4 py-2">
        <p className="text-sm text-muted-foreground">
          Enter this code on GitHub to connect:
        </p>
        <div className="select-all rounded-lg border border-border bg-muted/40 px-6 py-3 text-center font-mono text-2xl font-semibold tracking-[0.3em]">
          {state.userCode}
        </div>
        <Button onClick={() => void openExternal(state.verificationUri)}>
          Open github.com/login/device
        </Button>
        <p className="select-all font-mono text-xs text-muted-foreground">
          {state.verificationUri}
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner className="size-3.5" />
          Waiting for you to authorize…
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setState({ phase: "idle" })}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Sign in with GitHub — no tokens to create or paste. You’ll get a short
        code to enter on github.com.
      </p>
      {needsClientId && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gh-client-id">OAuth app client ID</Label>
          <Input
            id="gh-client-id"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="Iv1. or Ov23li…"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            One-time setup: GitHub → Settings → Developer settings → OAuth
            Apps → New. Any callback URL; check “Enable Device Flow”. Relay
            remembers the ID after this.
          </p>
        </div>
      )}
      <DialogFooter className="items-center">
        <button
          type="button"
          className="mr-auto rounded-sm text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onUseToken}
        >
          Use a token instead
        </button>
        <Button
          onClick={() => void start()}
          disabled={state.phase === "starting" || (needsClientId && !clientId.trim())}
        >
          {state.phase === "starting" && <Spinner className="size-4" />}
          Sign in with GitHub
        </Button>
      </DialogFooter>
    </div>
  );
}
