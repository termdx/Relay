import { Save, Server } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getServerConfig, LOCAL_SERVER, setServerConfig } from "@/lib/api/http";
import { toast } from "@/lib/toast";

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
  const isLocal =
    backendUrlValue === LOCAL_SERVER.backendUrl &&
    runtimeUrlValue === LOCAL_SERVER.runtimeUrl;

  function save() {
    setServerConfig({
      backendUrl: backendUrlValue.trim() || LOCAL_SERVER.backendUrl,
      runtimeUrl: runtimeUrlValue.trim() || LOCAL_SERVER.runtimeUrl,
      runtimeToken: token.trim(),
    });
    toast.success("Server saved — reloading to reconnect");
    setTimeout(() => window.location.reload(), 800);
  }

  function resetLocal() {
    setBackendUrlValue(LOCAL_SERVER.backendUrl);
    setRuntimeUrlValue(LOCAL_SERVER.runtimeUrl);
    setToken("");
    setServerConfig(LOCAL_SERVER);
    toast.success("Back to the local stack — reloading");
    setTimeout(() => window.location.reload(), 800);
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
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="srv-backend">Backend URL</Label>
          <Input
            id="srv-backend"
            value={backendUrlValue}
            onChange={(e) => setBackendUrlValue(e.target.value)}
            placeholder="https://relay.youragency.com/api"
            className="font-mono text-xs"
          />
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
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="srv-token">Runtime token</Label>
            <Input
              id="srv-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="from the server installer"
              autoComplete="off"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={save}>
            <Save className="size-4" />
            Save & reconnect
          </Button>
          {!isLocal && (
            <Button variant="outline" onClick={resetLocal}>
              Use local stack
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
