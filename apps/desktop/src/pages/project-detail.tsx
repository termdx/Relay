import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  Bot,
  CircleUser,
  Plug,
  User,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { backend } from "@/lib/api/backend";
import type { TimelineActor, TimelineEvent } from "@/lib/api/types";

/** Human labels for known event types; unknown types fall back to the raw name. */
const EVENT_LABELS: Record<string, string> = {
  "project.created": "Project created",
  "meeting.drafted": "Meeting drafted",
  "meeting.sent_for_approval": "Sent for client approval",
  "meeting.approved": "Client approved",
  "meeting.changes_requested": "Client requested changes",
};

function actorIcon(actor: TimelineActor) {
  switch (actor.kind) {
    case "ai":
      return Bot;
    case "client":
      return CircleUser;
    case "integration":
      return Plug;
    default:
      return User;
  }
}

function actorLabel(actor: TimelineActor): string {
  switch (actor.kind) {
    case "user":
      return "You";
    case "client":
      return actor.email;
    case "ai":
      return "Relay AI";
    case "integration":
      return actor.id;
    case "system":
      return "System";
  }
}

export function ProjectDetailPage() {
  const { id = "" } = useParams();
  const project = useQuery({
    queryKey: ["projects", id],
    queryFn: () => backend.projects.get(id),
    enabled: Boolean(id),
  });
  const timeline = useQuery({
    queryKey: ["projects", id, "timeline"],
    queryFn: () => backend.projects.timeline(id),
    enabled: Boolean(id),
  });

  if (project.isLoading) {
    return (
      <div className="flex justify-center py-16 text-muted-foreground">
        <Spinner className="size-5" />
      </div>
    );
  }
  if (project.isError || !project.data) {
    return (
      <div className="px-8 py-6">
        <p className="text-sm text-destructive">Couldn’t load this project.</p>
        <Button variant="outline" asChild className="mt-4">
          <Link to="/clients">
            <ArrowLeft className="size-4" />
            Back to clients
          </Link>
        </Button>
      </div>
    );
  }

  const p = project.data;
  return (
    <>
      <PageHeader
        title={p.name}
        description={`${p.client.name}${p.githubRepo ? ` · ${p.githubRepo}` : ""}`}
        actions={
          <Button variant="outline" asChild>
            <Link to={`/clients/${p.clientId}`}>
              <ArrowLeft className="size-4" />
              {p.client.name}
            </Link>
          </Button>
        }
      />

      <div className="px-8 py-6">
        {p.description ? (
          <p className="mb-6 max-w-2xl whitespace-pre-wrap text-sm text-muted-foreground">
            {p.description}
          </p>
        ) : null}

        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Timeline
        </h2>
        {timeline.isLoading ? (
          <div className="flex justify-center py-12 text-muted-foreground">
            <Spinner className="size-5" />
          </div>
        ) : timeline.data && timeline.data.length > 0 ? (
          <ol className="relative ml-3 border-l border-border">
            {timeline.data.map((event) => (
              <TimelineRow key={event.id} event={event} />
            ))}
          </ol>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-12 text-center">
            <div className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
              <Activity className="size-5" />
            </div>
            <div>
              <p className="font-medium">Nothing tracked yet</p>
              <p className="text-sm text-muted-foreground">
                Create a meeting on this project and its whole lifecycle shows
                up here.
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function TimelineRow({ event }: { event: TimelineEvent }) {
  const Icon = actorIcon(event.actor);
  const label = EVENT_LABELS[event.type] ?? event.type;
  const title =
    typeof event.payload.title === "string" ? event.payload.title : null;
  const comment =
    typeof event.payload.comment === "string" ? event.payload.comment : null;

  return (
    <li className="relative pb-6 pl-6 last:pb-0">
      <span className="absolute -left-[13px] grid size-6 place-items-center rounded-full border border-border bg-card">
        <Icon className="size-3.5 text-muted-foreground" />
      </span>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-medium">{label}</span>
        {title ? (
          <span className="text-sm text-muted-foreground">— {title}</span>
        ) : null}
        <Badge variant="outline" className="font-normal">
          {actorLabel(event.actor)}
        </Badge>
      </div>
      {comment ? (
        <p className="mt-1 text-sm italic text-muted-foreground">“{comment}”</p>
      ) : null}
      <time className="mt-0.5 block text-xs text-muted-foreground">
        {new Date(event.occurredAt).toLocaleString()}
      </time>
    </li>
  );
}
