import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Bot,
  Check,
  CircleUser,
  Copy,
  ExternalLink,
  Eye,
  Gavel,
  ListTodo,
  Plug,
  Plus,
  Sparkles,
  User,
  Webhook,
} from "lucide-react";
import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "@/lib/toast";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { backend } from "@/lib/api/backend";
import { ApiError } from "@/lib/api/http";
import { formatDate, formatDateTime } from "@/lib/format";
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

function eventLabel(type: string): string {
  // Unknown types: "acme.thing_happened" → "Thing happened".
  return (
    EVENT_LABELS[type] ??
    type
      .split(".")
      .pop()!
      .replace(/_/g, " ")
      .replace(/^\w/, (c) => c.toUpperCase())
  );
}

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
      return actor.id.replace(/^\w/, (c) => c.toUpperCase());
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

  if (project.isLoading) {
    return (
      <>
        <PageHeader
          title="Project"
          breadcrumb={[{ label: "Clients", to: "/clients" }, { label: "…" }]}
        />
        <div className="px-8 py-6" aria-hidden="true">
          <Skeleton className="mb-6 h-4 w-80" />
          <Skeleton className="h-9 w-72" />
          <Skeleton className="mt-6 h-40 w-full" />
        </div>
      </>
    );
  }
  if (project.isError || !project.data) {
    return (
      <>
        <PageHeader
          title="Project"
          breadcrumb={[
            { label: "Clients", to: "/clients" },
            { label: "Not found" },
          ]}
        />
        <div className="px-8 py-6">
          <ErrorState
            title="Couldn't load this project"
            description="It may have been deleted, or the backend is unreachable."
            onRetry={() => project.refetch()}
          />
        </div>
      </>
    );
  }

  const p = project.data;
  return (
    <>
      <PageHeader
        title={p.name}
        description={`${p.client.name}${p.githubRepo ? ` · ${p.githubRepo}` : ""}`}
        breadcrumb={[
          { label: "Clients", to: "/clients" },
          { label: p.client.name, to: `/clients/${p.clientId}` },
          { label: p.name },
        ]}
      />

      <div className="px-8 py-6">
        {p.description ? (
          <p className="mb-6 max-w-2xl whitespace-pre-wrap text-sm text-muted-foreground">
            {p.description}
          </p>
        ) : null}

        <Tabs defaultValue="work">
          <TabsList>
            <TabsTrigger value="work">
              <ListTodo />
              Work
            </TabsTrigger>
            <TabsTrigger value="activity">
              <Activity />
              Activity
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Eye />
              Portal & ingest
            </TabsTrigger>
          </TabsList>

          <TabsContent value="work">
            <AskSection projectId={p.id} />
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <TodosSection projectId={p.id} />
              <DecisionsSection projectId={p.id} />
            </div>
          </TabsContent>

          <TabsContent value="activity">
            <TimelineSection projectId={p.id} />
          </TabsContent>

          <TabsContent value="settings">
            <div className="grid gap-6 lg:grid-cols-2">
              <PortalSettingsCard project={p} />
              <IngestCard projectId={p.id} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function AskSection({ projectId }: { projectId: string }) {
  const [question, setQuestion] = React.useState("");
  const ask = useMutation({
    mutationFn: (q: string) => backend.projects.ask(projectId, q),
    onSuccess: () => setQuestion(""),
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Ask failed"),
  });

  return (
    <section className="rounded-lg border border-border bg-card p-5">
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
          aria-label="Ask Relay a question about this project"
        />
        <Button type="submit" disabled={ask.isPending || !question.trim()}>
          {ask.isPending ? <Spinner className="size-4" /> : "Ask"}
        </Button>
      </form>

      {ask.isPending ? (
        <div className="mt-4 space-y-2" aria-hidden="true">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : ask.data ? (
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
                    <span className="min-w-0 truncate" title={s.snippet}>
                      {s.snippet}
                    </span>
                  </div>
                ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** The per-project transcript webhook — the zero-paste meeting intake. */
function IngestCard({ projectId }: { projectId: string }) {
  const [copied, setCopied] = React.useState(false);
  const ingest = useQuery({
    queryKey: ["projects", projectId, "ingest-url"],
    queryFn: () => backend.projects.ingestUrl(projectId),
  });

  async function copy() {
    if (!ingest.data?.url) return;
    await navigator.clipboard.writeText(ingest.data.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="h-fit rounded-lg border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Webhook className="size-4" />
        Transcript ingest
      </h2>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Point your meeting notetaker (Fireflies, Fathom, Zapier, n8n…) at this
        URL — POST {"{"}"title", "transcript"{"}"} and Relay drafts the meeting,
        emails the client for approval, and files the tasks automatically.
      </p>
      {ingest.isLoading ? (
        <Skeleton className="mt-3 h-9 w-full" />
      ) : ingest.isError ? (
        <p className="mt-3 text-xs text-destructive">
          Couldn’t load the ingest URL —{" "}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => ingest.refetch()}
          >
            retry
          </button>
          .
        </p>
      ) : ingest.data?.url ? (
        <div className="mt-3 flex items-center gap-2">
          <code
            className="min-w-0 flex-1 truncate rounded-md bg-muted/40 px-3 py-2 font-mono text-xs"
            title={ingest.data.url}
          >
            {ingest.data.url}
          </code>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void copy()}
            aria-label="Copy ingest URL"
          >
            {copied ? (
              <Check className="size-4 text-success" />
            ) : (
              <Copy className="size-4" />
            )}
            Copy
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-warning">
          No ingest secret yet — run `relay up` once.
        </p>
      )}
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
    onSuccess: (_data, patch) => {
      queryClient.invalidateQueries({ queryKey: ["projects", project.id] });
      const changed = PORTAL_TOGGLES.find((t) => t.key in patch);
      if (changed) {
        const on = patch[changed.key];
        toast.success(
          `${changed.label} ${on ? "visible" : "hidden"} on the client portal`,
        );
      }
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not update portal settings",
      ),
  });

  return (
    <section className="h-fit rounded-lg border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Eye className="size-4" />
        Client portal
      </h2>
      <p className="mt-1.5 text-xs text-muted-foreground">
        What {project.client.name} sees — approvals are always on.
      </p>
      <div className="mt-3 flex flex-col gap-1">
        {PORTAL_TOGGLES.map((toggle) => {
          const on = effective[toggle.key];
          const disabled =
            toggle.key === "feedShowsCode" && !effective.showFeed;
          return (
            <div
              key={toggle.key}
              className={cn(
                "flex items-center gap-3 rounded-md px-2 py-2",
                !disabled && "hover:bg-accent/40",
              )}
              title={
                disabled ? "Turn on the activity feed to use this" : undefined
              }
            >
              <Switch
                id={`portal-${toggle.key}`}
                checked={on}
                disabled={update.isPending || disabled}
                onCheckedChange={(checked) =>
                  update.mutate({ [toggle.key]: checked })
                }
                aria-label={toggle.label}
              />
              <label
                htmlFor={`portal-${toggle.key}`}
                className={cn(
                  "flex flex-1 cursor-pointer items-baseline gap-2",
                  disabled && "cursor-not-allowed opacity-50",
                )}
              >
                <span className="text-sm">{toggle.label}</span>
                <span className="text-[11px] text-muted-foreground">
                  {toggle.hint}
                </span>
              </label>
            </div>
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
      toast.success("Todo added");
      invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not add todo"),
  });

  const toggle = useMutation({
    mutationFn: (todo: Todo) =>
      backend.todos.setStatus(todo.id, todo.status === "DONE" ? "OPEN" : "DONE"),
    onSuccess: (_data, todo) => {
      toast.success(
        todo.status === "DONE" ? "Todo reopened" : "Todo completed",
      );
      invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not update todo"),
  });

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <ListTodo className="size-4" />
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
          aria-label="New todo title"
        />
        <Button type="submit" size="icon" disabled={create.isPending || !title.trim()} aria-label="Add todo">
          {create.isPending ? <Spinner className="size-4" /> : <Plus className="size-4" />}
        </Button>
      </form>
      {todos.isLoading ? (
        <TodoListSkeleton />
      ) : todos.isError ? (
        <InlineError
          message="Couldn't load todos"
          onRetry={() => todos.refetch()}
        />
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
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
                title={todo.title}
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
                  className="shrink-0 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
      toast.success("Decision recorded");
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
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Gavel className="size-4" />
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
          aria-label="New decision title"
        />
        <Button
          type="submit"
          size="icon"
          disabled={create.isPending || !title.trim()}
          aria-label="Record decision"
        >
          {create.isPending ? <Spinner className="size-4" /> : <Gavel className="size-4" />}
        </Button>
      </form>
      {decisions.isLoading ? (
        <TodoListSkeleton />
      ) : decisions.isError ? (
        <InlineError
          message="Couldn't load decisions"
          onRetry={() => decisions.refetch()}
        />
      ) : decisions.data && decisions.data.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {decisions.data.map((decision) => (
            <li
              key={decision.id}
              className="rounded-md border border-border px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <Gavel className="size-3.5 shrink-0 text-muted-foreground" />
                <span
                  className="min-w-0 flex-1 truncate text-sm"
                  title={decision.title}
                >
                  {decision.title}
                </span>
                <time className="shrink-0 text-xs text-muted-foreground">
                  {formatDate(decision.createdAt)}
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

function TimelineSection({ projectId }: { projectId: string }) {
  const timeline = useQuery({
    queryKey: ["projects", projectId, "timeline"],
    queryFn: () => backend.projects.timeline(projectId),
  });

  if (timeline.isLoading) return <LoadingState label="Loading activity…" />;
  if (timeline.isError) {
    return (
      <ErrorState
        title="Couldn't load the timeline"
        onRetry={() => timeline.refetch()}
      />
    );
  }
  if (!timeline.data || timeline.data.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="Nothing tracked yet"
        description="Create a meeting on this project and its whole lifecycle shows up here."
        action={
          <Button variant="outline" size="sm" asChild>
            <Link to="/meetings/new">New meeting</Link>
          </Button>
        }
      />
    );
  }
  return (
    <ol className="relative ml-3 border-l border-border">
      {timeline.data.map((event) => (
        <TimelineRow key={event.id} event={event} />
      ))}
    </ol>
  );
}

function TimelineRow({ event }: { event: TimelineEvent }) {
  const Icon = actorIcon(event.actor);
  const title =
    typeof event.payload.title === "string" ? event.payload.title : null;
  const comment =
    typeof event.payload.comment === "string" ? event.payload.comment : null;

  return (
    <li className="relative pb-6 pl-6 last:pb-0">
      <span className="absolute -left-3 grid size-6 place-items-center rounded-full border border-border bg-card">
        <Icon className="size-3.5 text-muted-foreground" />
      </span>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-medium">{eventLabel(event.type)}</span>
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
        {formatDateTime(event.occurredAt)}
      </time>
    </li>
  );
}

function TodoListSkeleton() {
  return (
    <div className="flex flex-col gap-1.5" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

function InlineError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-destructive">
      {message} —{" "}
      <button
        type="button"
        className="underline underline-offset-2"
        onClick={onRetry}
      >
        retry
      </button>
    </p>
  );
}
