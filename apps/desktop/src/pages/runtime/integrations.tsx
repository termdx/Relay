import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Eye, EyeOff, Plug, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
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
import { Spinner } from "@/components/ui/spinner";
import {
  runtime,
  RuntimeError,
  type IntegrationManifest,
} from "@/lib/api/runtime";
import { openExternal } from "@/lib/open";
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
          <>
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
            <DialogFooter className="items-center">
              {manifest.id === "github" && (
                <button
                  type="button"
                  className="mr-auto text-xs text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => setUseToken(false)}
                >
                  Use GitHub sign-in instead
                </button>
              )}
              <Button
                onClick={() => connect.mutate()}
                disabled={connect.isPending || missingRequired}
              >
                {connect.isPending && <Spinner className="size-4" />}
                Connect
              </Button>
            </DialogFooter>
          </>
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
  const [showSecret, setShowSecret] = React.useState(false);
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
      toast.success("Email connected — restart the stack to start sending");
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label>Provider</Label>
        <Select value={providerId} onValueChange={setProviderId}>
          <SelectTrigger>
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
        <div className="relative">
          <Input
            id="smtp-secret"
            type={showSecret ? "text" : "password"}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="pr-10"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setShowSecret((v) => !v)}
            aria-label={showSecret ? "Hide" : "Show"}
            className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:text-foreground"
          >
            {showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
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

      <DialogFooter>
        <Button onClick={() => connect.mutate()} disabled={connect.isPending || missing}>
          {connect.isPending && <Spinner className="size-4" />}
          Connect email
        </Button>
      </DialogFooter>
    </div>
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
          className="mr-auto text-xs text-muted-foreground underline-offset-2 hover:underline"
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
