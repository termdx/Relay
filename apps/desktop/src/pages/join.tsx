import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Spinner } from "@/components/ui/spinner";
import {
  ApiError,
  backendUrl,
  externalRequest,
  getServerConfig,
  setServerConfig,
} from "@/lib/api/http";
import type { AuthResult, ServerConnection } from "@/lib/api/types";
import { useAuth } from "@/lib/auth";

/**
 * An invite is pasted either as the full link (https://relay.agency.com/join/x)
 * or as a bare token (local dev has no public URL to build links from).
 * A link pins the API origin; a bare token targets the configured backend.
 */
function parseInvite(input: string): { apiBase: string; token: string } | null {
  const value = input.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/join\/([A-Za-z0-9_-]+)\/?$/);
    if (!match) return null;
    return { apiBase: `${url.origin}/api`, token: match[1]! };
  } catch {
    // Not a URL — treat as a bare token for the configured backend.
    return /^[A-Za-z0-9_-]{16,}$/.test(value)
      ? { apiBase: backendUrl(), token: value }
      : null;
  }
}

/** Self-serve team signup: paste an invite, pick your own credentials. */
export function JoinForm() {
  const { adopt } = useAuth();
  const [link, setLink] = React.useState("");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const invite = parseInvite(link);
  const linkInvalid = link.trim().length > 0 && !invite;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invite || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await externalRequest<
        AuthResult & { server: ServerConnection | null }
      >(invite.apiBase, "/auth/join", {
        method: "POST",
        body: { token: invite.token, name, email, password },
      });
      // Adopt the connection the server describes; fall back to the pasted
      // link's origin so local/tunnel setups still land somewhere sane.
      const current = getServerConfig();
      setServerConfig({
        backendUrl: result.server?.backendUrl ?? invite.apiBase,
        runtimeUrl:
          result.server?.runtimeUrl ??
          invite.apiBase.replace(/\/api$/, "/runtime"),
        runtimeToken: result.server?.runtimeToken ?? current.runtimeToken,
      });
      adopt(result.accessToken, result.user);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not reach that server — check the link.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Join your agency</CardTitle>
        <CardDescription>
          Paste the invite link from your team, then create your account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="join-link">Invite link</Label>
            <Input
              id="join-link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://relay.youragency.com/join/…"
              className="font-mono text-xs"
              aria-invalid={linkInvalid}
              required
              autoFocus
            />
            {linkInvalid && (
              <p className="text-xs text-destructive">
                That doesn’t look like an invite link or token.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="join-name">Your name</Label>
            <Input
              id="join-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sam Doe"
              maxLength={80}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="join-email">Email</Label>
            <Input
              id="join-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@agency.com"
              autoComplete="email"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="join-password">Password</Label>
            <PasswordInput
              id="join-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8+ characters"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy || !invite} className="mt-1">
            {busy && <Spinner className="size-4" />}
            Create account &amp; connect
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
