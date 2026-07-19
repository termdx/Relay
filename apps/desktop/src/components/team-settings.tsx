import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Link2, Users, X } from "lucide-react";
import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { backend } from "@/lib/api/backend";
import { ApiError } from "@/lib/api/http";
import type { InviteView } from "@/lib/api/types";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";

/**
 * The team: who's in, and (owner only) invite links. Teammates self-register
 * through a link — the owner shares it once and never manages credentials.
 */
export function TeamSettingsCard() {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";

  const members = useQuery({
    queryKey: ["team-members"],
    queryFn: backend.auth.members,
  });

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Users className="size-4" />
        Team
      </h2>

      {members.isLoading ? (
        <div className="flex justify-center py-6 text-muted-foreground">
          <Spinner className="size-5" />
        </div>
      ) : members.isError ? (
        <p className="text-sm text-destructive">Couldn’t load the team.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {(members.data ?? []).map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2.5">
              <Avatar className="size-8">
                {m.avatar && <AvatarImage src={m.avatar} alt="" />}
                <AvatarFallback className="text-xs">
                  {m.name.slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {m.name}
                  {m.id === user?.id && (
                    <span className="text-muted-foreground"> (you)</span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">{m.email}</p>
              </div>
              <Badge
                variant={m.role === "owner" ? "primary" : "outline"}
                className="ml-auto"
              >
                {m.role}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      {isOwner && <InviteManager />}
    </section>
  );
}

function InviteManager() {
  const queryClient = useQueryClient();
  const [freshLink, setFreshLink] = React.useState<string | null>(null);

  const invites = useQuery({
    queryKey: ["team-invites"],
    queryFn: backend.auth.invites.list,
  });

  const create = useMutation({
    mutationFn: () => backend.auth.invites.create(),
    onSuccess: (invite) => {
      queryClient.invalidateQueries({ queryKey: ["team-invites"] });
      // Local stacks have no public URL to build a link from — hand out the
      // raw token; the join form accepts either.
      setFreshLink(invite.url ?? invite.token);
      toast.success("Invite created — copy it now, it won't be shown again");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not create invite"),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => backend.auth.invites.revoke(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-invites"] });
      toast.success("Invite revoked");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not revoke invite"),
  });

  const active = (invites.data ?? []).filter(
    (i) => !i.revoked && new Date(i.expiresAt).getTime() > Date.now(),
  );

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Invite links</p>
          <p className="text-xs text-muted-foreground">
            Anyone with a live link can join as a member. Links expire after 7
            days and are revocable.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => create.mutate()}
          disabled={create.isPending}
        >
          {create.isPending ? (
            <Spinner className="size-4" />
          ) : (
            <Link2 className="size-4" />
          )}
          New invite
        </Button>
      </div>

      {freshLink && <FreshInvite value={freshLink} onDismiss={() => setFreshLink(null)} />}

      {active.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {active.map((invite) => (
            <InviteRow
              key={invite.id}
              invite={invite}
              onRevoke={() => revoke.mutate(invite.id)}
              revoking={revoke.isPending}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Shown once, right after minting — the raw link never appears again. */
function FreshInvite({
  value,
  onDismiss,
}: {
  value: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-accent/30 px-3 py-2">
      <code className="min-w-0 flex-1 truncate font-mono text-xs">{value}</code>
      <Button variant="outline" size="sm" onClick={copy}>
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? "Copied" : "Copy"}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}

function InviteRow({
  invite,
  onRevoke,
  revoking,
}: {
  invite: InviteView;
  onRevoke: () => void;
  revoking: boolean;
}) {
  const expires = new Date(invite.expiresAt);
  const daysLeft = Math.max(
    0,
    Math.ceil((expires.getTime() - Date.now()) / 86_400_000),
  );
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-xs">
      <span className="text-muted-foreground">
        Created {new Date(invite.createdAt).toLocaleDateString()} · expires in{" "}
        {daysLeft} {daysLeft === 1 ? "day" : "days"} · used {invite.usedCount}
        {invite.maxUses !== null && ` / ${invite.maxUses}`}×
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={onRevoke}
        disabled={revoking}
        className="text-destructive hover:text-destructive"
      >
        Revoke
      </Button>
    </li>
  );
}
