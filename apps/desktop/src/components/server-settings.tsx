import { Save, Server } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Spinner } from "@/components/ui/spinner";
import { getServerConfig, LOCAL_SERVER, setServerConfig } from "@/lib/api/http";
import { toast } from "@/lib/toast";

/** Accept http(s) URLs; empty means "fall back to the local default". */
function isValidUrl(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  try {
    const url = new URL(v);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Trailing slashes shouldn't decide whether we're "on the local stack". */
function normalize(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

/**
 * The agency-server connection form. Lives in Settings, and also on the
 * auth screen — a fresh install pointed at a dead localhost backend must be
 * able to reach a hosted Relay before it can authenticate at all.
 */
export function ServerSettingsCard() {
  const current = getServerConfig();
  const [backendUrlValue, setBackendUrlValue] = React.useState(current.backendUrl);
  const [runtimeUrlValue, setRuntimeUrlValue] = React.useState(current.runtimeUrl);
  const [token, setToken] = React.useState(current.runtimeToken);
  const [saving, setSaving] = React.useState(false);

  const isLocal =
    normalize(backendUrlValue) === normalize(LOCAL_SERVER.backendUrl) &&
    normalize(runtimeUrlValue) === normalize(LOCAL_SERVER.runtimeUrl);

  const urlsValid = isValidUrl(backendUrlValue) && isValidUrl(runtimeUrlValue);
  const dirty =
    backendUrlValue !== current.backendUrl ||
    runtimeUrlValue !== current.runtimeUrl ||
    token !== current.runtimeToken;

  function reconnect(message: string) {
    setSaving(true);
    toast.success(message);
    setTimeout(() => window.location.reload(), 800);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!urlsValid || !dirty || saving) return;
    setServerConfig({
      backendUrl: backendUrlValue.trim() || LOCAL_SERVER.backendUrl,
      runtimeUrl: runtimeUrlValue.trim() || LOCAL_SERVER.runtimeUrl,
      runtimeToken: token.trim(),
    });
    reconnect("Server saved — reloading to reconnect");
  }

  function resetLocal() {
    setServerConfig(LOCAL_SERVER);
    reconnect("Back to the local stack — reloading");
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Server className="size-4" />
        Agency server
      </h2>
      <p className="mb-4 text-xs text-muted-foreground">
        {isLocal
          ? "Connected to the local stack on this machine."
          : "Connected to a remote agency server."}{" "}
        Point at a hosted Relay (e.g. https://relay.youragency.com/api) to work
        against the agency's shared stack.
      </p>
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="srv-backend">Backend URL</Label>
          <Input
            id="srv-backend"
            value={backendUrlValue}
            onChange={(e) => setBackendUrlValue(e.target.value)}
            placeholder="https://relay.youragency.com/api"
            className="font-mono text-xs"
            aria-invalid={!isValidUrl(backendUrlValue)}
            aria-describedby={!isValidUrl(backendUrlValue) ? "srv-backend-error" : undefined}
          />
          {!isValidUrl(backendUrlValue) && (
            <p id="srv-backend-error" className="text-xs text-destructive">
              Needs to be a full http(s) URL — or leave empty for the local default.
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="srv-runtime">Runtime URL</Label>
            <Input
              id="srv-runtime"
              value={runtimeUrlValue}
              onChange={(e) => setRuntimeUrlValue(e.target.value)}
              placeholder="https://relay.youragency.com/runtime"
              className="font-mono text-xs"
              aria-invalid={!isValidUrl(runtimeUrlValue)}
              aria-describedby={!isValidUrl(runtimeUrlValue) ? "srv-runtime-error" : undefined}
            />
            {!isValidUrl(runtimeUrlValue) && (
              <p id="srv-runtime-error" className="text-xs text-destructive">
                Needs to be a full http(s) URL.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="srv-token">Runtime token</Label>
            <PasswordInput
              id="srv-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="from the server installer"
              autoComplete="off"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={!urlsValid || !dirty || saving}>
            {saving ? <Spinner className="size-4" /> : <Save className="size-4" />}
            Save & reconnect
          </Button>
          {!isLocal && (
            <Button
              type="button"
              variant="outline"
              onClick={resetLocal}
              disabled={saving}
            >
              Use local stack
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
