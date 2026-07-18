import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  Bot,
  Check,
  CircleUser,
  ExternalLink,
  Eye,
  Gavel,
  Plug,
  Plus,
  Sparkles,
  User,
} from "lucide-react";
import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "@/lib/toast";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { backend } from "@/lib/api/backend";
import { ApiError } from "@/lib/api/http";
import { openExternal } from "@/lib/open";
import { cn } from "@/lib/utils";
import type {
  PortalSettings,
  ProjectWithClient,
  TimelineActor,
  TimelineEvent,
  Todo,
} from "@/lib/api/types";

/** Human labels for known event types; unknown types fall back to the raw name. */
const EVENT_LABELS: Record<string, string> = {
  "project.created": "Project created",
  "meeting.drafted": "Meeting drafted",
  "meeting.sent_for_approval": "Sent for client approval",
  "meeting.approved": "Client approved",
  "meeting.changes_requested": "Client requested changes",
  "todo.created": "Todo added",
  "todo.completed": "Todo completed",
  "todo.reopened": "Todo reopened",
  "decision.recorded": "Decision recorded",
  "notification.sent": "Client emailed",
  "agent.run_completed": "Agent run completed",
  "github.push": "Commits pushed",
  "github.pr_opened": "PR opened",
  "github.pr_merged": "PR merged",
  "github.pr_closed": "PR closed",
  "github.issue_opened": "Issue opened",
  "github.issue_closed": "Issue closed",
  "gitlab.push": "Commits pushed",
  "gitlab.mr_opened": "MR opened",
  "gitlab.mr_merged": "MR merged",
  "gitlab.mr_closed": "MR closed",
  "gitlab.issue_opened": "Issue opened",
  "gitlab.issue_closed": "Issue closed",
  "bitbucket.push": "Commits pushed",
  "bitbucket.pr_opened": "PR opened",
  "bitbucket.pr_merged": "PR merged",
  "bitbucket.pr_declined": "PR declined",
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

        <AskSection projectId={p.id} />

        <PortalSettingsCard project={p} />

        <div className="mb-8 grid gap-8 lg:grid-cols-2">
          <TodosSection projectId={p.id} />
          <DecisionsSection projectId={p.id} />
        </div>

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

function AskSection({ projectId }: { projectId: string }) {
  const [question, setQuestion] = React.useState("");
  const ask = useMutation({
    mutationFn: (q: string) => backend.projects.ask(projectId, q),
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Ask failed"),
  });

  return (
    <section className="mb-8 rounded-lg border border-border bg-card p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Sparkles className="size-4 text-primary" />
        Ask Relay
      </h2>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (question.trim()) ask.mutate(question.trim());
        }}
      >
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What shipped this week? Why did we choose X? When is the demo?"
        />
        <Button type="submit" disabled={ask.isPending} aria-label="Ask">
          {ask.isPending ? <Spinner className="size-4" /> : "Ask"}
        </Button>
      </form>

      {ask.data ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {ask.data.answer}
          </p>
          {ask.data.sources.some((s) => s.cited) ? (
            <div className="flex flex-col gap-1 border-t border-border pt-3">
              {ask.data.sources
                .filter((s) => s.cited)
                .map((s) => (
                  <div
                    key={s.ref}
                    className="flex items-baseline gap-2 text-xs text-muted-foreground"
                  >
                    <span className="shrink-0 font-mono text-primary">
                      [{s.ref}]
                    </span>
                    <span className="min-w-0 truncate">{s.snippet}</span>
                  </div>
                ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

const PORTAL_TOGGLES: {
  key: keyof PortalSettings;
  label: string;
  hint: string;
}[] = [
  { key: "showAnalytics", label: "Analytics", hint: "progress, stats, activity chart" },
  { key: "showFeed", label: "Activity feed", hint: "the project timeline" },
  { key: "feedShowsCode", label: "Code events in feed", hint: "pushes, PRs, issues" },
  { key: "showTodos", label: "Deliverables", hint: "the todo list" },
  { key: "showDecisions", label: "Decisions", hint: "the decisions log" },
  { key: "showAsk", label: "Relay AI chat", hint: "grounded Q&A" },
];

const DEFAULT_PORTAL: PortalSettings = {
  showAnalytics: true,
  showFeed: true,
  feedShowsCode: true,
  showTodos: true,
  showDecisions: true,
  showAsk: true,
};

/** What this project's client can see — enforced server-side on the portal API. */
function PortalSettingsCard({ project }: { project: ProjectWithClient }) {
  const queryClient = useQueryClient();
  const effective: PortalSettings = {
    ...DEFAULT_PORTAL,
    ...(project.portalSettings ?? {}),
  };

  const update = useMutation({
    mutationFn: (patch: Partial<PortalSettings>) =>
      backend.projects.update(project.id, { portalSettings: patch }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", project.id] });
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not update portal settings",
      ),
  });

  return (
    <section className="mb-8 rounded-lg border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Eye className="size-4" />
        Client portal
        <span className="ml-auto text-[11px] font-normal normal-case tracking-normal">
          what {project.client.name} sees — approvals are always on
        </span>
      </h2>
      <div className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {PORTAL_TOGGLES.map((toggle) => {
          const on = effective[toggle.key];
          const disabled =
            toggle.key === "feedShowsCode" && !effective.showFeed;
          return (
            <label
              key={toggle.key}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent/40",
                disabled && "pointer-events-none opacity-40",
              )}
            >
              <input
                type="checkbox"
                checked={on}
                disabled={update.isPending || disabled}
                onChange={() => update.mutate({ [toggle.key]: !on })}
                className="size-4 accent-[var(--primary)]"
              />
              <span className="text-sm">{toggle.label}</span>
              <span className="ml-auto text-[11px] text-muted-foreground">
                {toggle.hint}
              </span>
            </label>
          );
        })}
      </div>
    </section>
  );
}

function TodosSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = React.useState("");
  const todos = useQuery({
    queryKey: ["projects", projectId, "todos"],
    queryFn: () => backend.todos.list(projectId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["projects", projectId, "todos"] });
    queryClient.invalidateQueries({ queryKey: ["projects", projectId, "timeline"] });
  };

  const create = useMutation({
    mutationFn: () => backend.todos.create(projectId, { title }),
    onSuccess: () => {
      setTitle("");
      invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not add todo"),
  });

  const toggle = useMutation({
    mutationFn: (todo: Todo) =>
      backend.todos.setStatus(todo.id, todo.status === "DONE" ? "OPEN" : "DONE"),
    onSuccess: invalidate,
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not update todo"),
  });

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Todos
      </h2>
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) create.mutate();
        }}
      >
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a todo…"
        />
        <Button type="submit" size="icon" disabled={create.isPending} aria-label="Add todo">
          {create.isPending ? <Spinner className="size-4" /> : <Plus className="size-4" />}
        </Button>
      </form>
      {todos.isLoading ? (
        <div className="flex justify-center py-6 text-muted-foreground">
          <Spinner className="size-4" />
        </div>
      ) : todos.data && todos.data.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {todos.data.map((todo) => (
            <li
              key={todo.id}
              className="flex items-center gap-2.5 rounded-md border border-border px-3 py-2"
            >
              <button
                type="button"
                onClick={() => toggle.mutate(todo)}
                aria-label={todo.status === "DONE" ? "Reopen todo" : "Complete todo"}
                className={cn(
                  "grid size-4.5 shrink-0 place-items-center rounded border transition-colors",
                  todo.status === "DONE"
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "border-border hover:border-primary",
                )}
              >
                {todo.status === "DONE" ? <Check className="size-3" /> : null}
              </button>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-sm",
                  todo.status === "DONE" && "text-muted-foreground line-through",
                )}
              >
                {todo.title}
              </span>
              {todo.source === "meeting" ? (
                <Badge variant="outline" className="shrink-0 font-normal">
                  meeting
                </Badge>
              ) : null}
              {todo.externalUrl ? (
                <button
                  type="button"
                  onClick={() => void openExternal(todo.externalUrl!)}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label="Open linked issue"
                >
                  <ExternalLink className="size-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
          Nothing yet — add one, or approve a meeting and its tasks land here.
        </p>
      )}
    </section>
  );
}

function DecisionsSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = React.useState("");
  const decisions = useQuery({
    queryKey: ["projects", projectId, "decisions"],
    queryFn: () => backend.decisions.list(projectId),
  });

  const create = useMutation({
    mutationFn: () => backend.decisions.create(projectId, { title }),
    onSuccess: () => {
      setTitle("");
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "decisions"] });
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "timeline"] });
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not record decision",
      ),
  });

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Decisions
      </h2>
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) create.mutate();
        }}
      >
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Record a decision…"
        />
        <Button
          type="submit"
          size="icon"
          disabled={create.isPending}
          aria-label="Record decision"
        >
          {create.isPending ? <Spinner className="size-4" /> : <Gavel className="size-4" />}
        </Button>
      </form>
      {decisions.isLoading ? (
        <div className="flex justify-center py-6 text-muted-foreground">
          <Spinner className="size-4" />
        </div>
      ) : decisions.data && decisions.data.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {decisions.data.map((decision) => (
            <li
              key={decision.id}
              className="rounded-md border border-border px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <Gavel className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {decision.title}
                </span>
                <time className="shrink-0 text-xs text-muted-foreground">
                  {new Date(decision.createdAt).toLocaleDateString()}
                </time>
              </div>
              {decision.detail ? (
                <p className="mt-1 pl-6 text-xs text-muted-foreground">
                  {decision.detail}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
          No decisions recorded — the “why” behind the project lives here.
        </p>
      )}
    </section>
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
