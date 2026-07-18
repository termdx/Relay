import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Activity,
  Bot,
  CheckCircle2,
  ChevronDown,
  CircleUser,
  GitMerge,
  GitPullRequest,
  Gavel,
  ListChecks,
  LogOut,
  Mail,
  Plug,
  Send,
  User,
} from "lucide-react";
import * as React from "react";
import {
  BACKEND_URL,
  portal,
  PortalApiError,
  session,
  type AskResult,
  type FeedEvent,
  type PortalProject,
  type PortalVisibility,
} from "./api";

const FALLBACK_NAME: string =
  (import.meta.env.VITE_AGENCY_NAME as string | undefined) ?? "Project Portal";

/** White/near-black foreground by accent luminance (YIQ). */
function contrastForeground(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const yiq =
    (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000;
  return yiq >= 150 ? "#1c1930" : "#ffffff";
}

/** Fetches agency branding (public) and themes the whole app with it. */
function useBranding() {
  const query = useQuery({
    queryKey: ["branding"],
    queryFn: portal.branding,
    staleTime: 5 * 60 * 1000,
  });
  const data = query.data;

  React.useEffect(() => {
    if (!data) return;
    document.title = data.agencyName ?? FALLBACK_NAME;
    if (data.accentColor) {
      const root = document.documentElement.style;
      root.setProperty("--primary", data.accentColor);
      root.setProperty("--ring", data.accentColor);
      root.setProperty("--primary-foreground", contrastForeground(data.accentColor));
    }
  }, [data]);

  return {
    name: data?.agencyName ?? FALLBACK_NAME,
    logo: data?.logo ?? null,
  };
}

/* ── auth shell ──────────────────────────────────────────────────────────── */

export default function App() {
  // Magic links land on /auth/<token>; everything else is the app.
  const authToken = window.location.pathname.startsWith("/auth/")
    ? window.location.pathname.slice("/auth/".length)
    : null;

  if (authToken) return <Redeem token={authToken} />;
  if (!session.get()) return <Login />;
  return <Portal />;
}

function Redeem({ token }: { token: string }) {
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    portal
      .redeem(token)
      .then(({ accessToken }) => {
        session.set(accessToken);
        window.location.replace("/");
      })
      .catch((e: unknown) =>
        setError(e instanceof PortalApiError ? e.message : "Sign-in failed."),
      );
  }, [token]);

  return (
    <Centered>
      {error ? (
        <div className="text-center">
          <p className="text-sm text-destructive">{error}</p>
          <a href="/" className="mt-3 inline-block text-sm text-primary underline-offset-2 hover:underline">
            Request a new link
          </a>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Signing you in…</p>
      )}
    </Centered>
  );
}

function Login() {
  const { name, logo } = useBranding();
  const [email, setEmail] = React.useState("");
  const request = useMutation({
    mutationFn: () => portal.requestLink(email),
  });

  return (
    <Centered>
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6">
        {logo && (
          <img src={logo} alt="" className="mb-3 size-10 object-contain" />
        )}
        <h1 className="text-lg font-semibold tracking-tight">{name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter your email and we’ll send you a sign-in link.
        </p>
        {request.isSuccess ? (
          <div className="mt-5 flex items-start gap-2.5 rounded-md bg-accent px-3 py-2.5 text-sm text-accent-foreground">
            <Mail className="mt-0.5 size-4 shrink-0" />
            If that email belongs to a client, a sign-in link is on its way.
          </div>
        ) : (
          <form
            className="mt-5 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (email.trim()) request.mutate();
            }}
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="h-10 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={request.isPending}
              className="h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {request.isPending ? "Sending…" : "Email me a sign-in link"}
            </button>
            {request.isError && (
              <p className="text-xs text-destructive">Could not send the link. Try again.</p>
            )}
          </form>
        )}
        <PoweredBy className="mt-6 justify-center" />
      </div>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center px-4">{children}</div>
  );
}

/* ── the portal ──────────────────────────────────────────────────────────── */

type Tab = "overview" | "ask" | "approvals";

function Portal() {
  const { name: agencyName, logo } = useBranding();
  const me = useQuery({ queryKey: ["me"], queryFn: portal.me });
  const [projectId, setProjectId] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<Tab>("overview");

  const projects = me.data?.projects ?? [];
  const active =
    projects.find((p) => p.id === projectId) ?? projects[0] ?? null;

  // Never leave the client on a tab the agency turned off.
  React.useEffect(() => {
    if (tab === "ask" && active && !active.portal.showAsk) setTab("overview");
  }, [tab, active]);

  if (me.isLoading) {
    return <Centered><p className="text-sm text-muted-foreground">Loading…</p></Centered>;
  }
  if (me.isError || !me.data) {
    return (
      <Centered>
        <p className="text-sm text-destructive">Couldn’t load your portal.</p>
      </Centered>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16">
      <header className="flex items-center justify-between py-5">
        <div className="flex items-center gap-3">
          {logo && <img src={logo} alt="" className="size-9 object-contain" />}
          <div>
            <div className="text-base font-semibold tracking-tight">{agencyName}</div>
            <div className="text-xs text-muted-foreground">
              {me.data.client.name}
              {me.data.client.company ? ` · ${me.data.client.company}` : ""}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {projects.length > 1 && active && (
            <ProjectPicker
              projects={projects}
              activeId={active.id}
              onPick={setProjectId}
            />
          )}
          <button
            type="button"
            onClick={() => {
              session.clear();
              window.location.assign("/");
            }}
            aria-label="Sign out"
            className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </header>

      {active ? (
        <>
          <div className="mb-1 flex items-baseline justify-between">
            <h1 className="text-xl font-semibold tracking-tight">{active.name}</h1>
            <span className="text-xs text-muted-foreground">
              {active.status === "ACTIVE" ? "In progress" : active.status === "PAUSED" ? "Paused" : "Completed"}
            </span>
          </div>
          {active.description && (
            <p className="mb-4 max-w-2xl text-sm text-muted-foreground">{active.description}</p>
          )}

          <nav className="mb-6 flex gap-1 border-b border-border">
            {(
              [
                ["overview", "Overview"],
                ...(active.portal.showAsk ? [["ask", "Ask"] as [Tab, string]] : []),
                ["approvals", "Approvals"],
              ] as [Tab, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                  tab === key
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          {tab === "overview" && (
            <Overview projectId={active.id} visibility={active.portal} />
          )}
          {tab === "ask" && active.portal.showAsk && (
            <Ask projectId={active.id} />
          )}
          {tab === "approvals" && <Approvals />}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No projects yet.</p>
      )}

      <footer className="mt-12 flex justify-center border-t border-border pt-5">
        <PoweredBy />
      </footer>
    </div>
  );
}

function ProjectPicker({
  projects,
  activeId,
  onPick,
}: {
  projects: PortalProject[];
  activeId: string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="relative">
      <select
        value={activeId}
        onChange={(e) => onPick(e.target.value)}
        className="h-9 appearance-none rounded-md border border-input bg-transparent pl-3 pr-8 text-sm outline-none focus:ring-2 focus:ring-ring"
        aria-label="Switch project"
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

function PoweredBy({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground ${className}`}
    >
      <img src="/relay-logo.png" alt="" className="size-10.5" />
      Powered by Relay
    </span>
  );
}

/* ── overview: analytics + feed + todos + decisions ─────────────────────── */

function Overview({
  projectId,
  visibility,
}: {
  projectId: string;
  visibility: PortalVisibility;
}) {
  const overview = useQuery({
    queryKey: ["overview", projectId],
    queryFn: () => portal.overview(projectId),
    enabled: visibility.showAnalytics,
  });
  const feed = useQuery({
    queryKey: ["feed", projectId],
    queryFn: () => portal.feed(projectId),
    enabled: visibility.showFeed,
  });
  const todos = useQuery({
    queryKey: ["todos", projectId],
    queryFn: () => portal.todos(projectId),
    enabled: visibility.showTodos,
  });
  const decisions = useQuery({
    queryKey: ["decisions", projectId],
    queryFn: () => portal.decisions(projectId),
    enabled: visibility.showDecisions,
  });

  const o = overview.data;
  const total = (o?.todos.open ?? 0) + (o?.todos.done ?? 0);
  const pct = total > 0 ? Math.round(((o?.todos.done ?? 0) / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      {visibility.showAnalytics && (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Progress"
          value={total > 0 ? `${pct}%` : "—"}
          sub={total > 0 ? `${o?.todos.done}/${total} tasks done` : "no tasks yet"}
          icon={ListChecks}
        />
        <Stat
          label="Commits · 30d"
          value={String(o?.last30Days.commits ?? "—")}
          sub="pushes to the repo"
          icon={Activity}
        />
        <Stat
          label="PRs merged · 30d"
          value={String(o?.last30Days.prsMerged ?? "—")}
          sub="changes shipped"
          icon={GitMerge}
        />
        <Stat
          label="Issues closed · 30d"
          value={String(o?.last30Days.issuesClosed ?? "—")}
          sub="work completed"
          icon={GitPullRequest}
        />
      </div>
      )}

      {visibility.showAnalytics && (
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Activity — last 8 weeks</h2>
        <ActivityChart weeks={o?.weeklyActivity ?? []} />
      </section>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {visibility.showTodos && (
        <section>
          <h2 className="mb-2.5 text-sm font-semibold">Deliverables</h2>
          {todos.data && todos.data.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {todos.data.slice(0, 8).map((todo) => (
                <li
                  key={todo.id}
                  className="flex items-center gap-2.5 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <CheckCircle2
                    className={`size-4 shrink-0 ${todo.status === "DONE" ? "text-success" : "text-muted-foreground/40"}`}
                  />
                  <span
                    className={`min-w-0 flex-1 truncate ${todo.status === "DONE" ? "text-muted-foreground line-through" : ""}`}
                  >
                    {todo.title}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyNote>Deliverables appear here as work is agreed.</EmptyNote>
          )}
        </section>
        )}

        {visibility.showDecisions && (
        <section>
          <h2 className="mb-2.5 text-sm font-semibold">Decisions</h2>
          {decisions.data && decisions.data.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {decisions.data.slice(0, 6).map((decision) => (
                <li key={decision.id} className="rounded-md border border-border px-3 py-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Gavel className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{decision.title}</span>
                    <time className="shrink-0 text-xs text-muted-foreground">
                      {new Date(decision.createdAt).toLocaleDateString()}
                    </time>
                  </div>
                  {decision.detail && (
                    <p className="mt-1 pl-5.5 text-xs text-muted-foreground">{decision.detail}</p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyNote>Key decisions and their reasoning land here.</EmptyNote>
          )}
        </section>
        )}
      </div>

      {visibility.showFeed && (
      <section>
        <h2 className="mb-2.5 text-sm font-semibold">Recent activity</h2>
        {feed.data && feed.data.length > 0 ? (
          <ol className="relative ml-3 border-l border-border">
            {feed.data.slice(0, 20).map((event) => (
              <FeedRow key={event.id} event={event} />
            ))}
          </ol>
        ) : (
          <EmptyNote>Project activity shows up here automatically.</EmptyNote>
        )}
      </section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

/** Single-series bar chart: violet accent, rounded data-ends, hover values.
 * The plot area has a FIXED height (percentage heights inside flex-sized
 * parents collapse unpredictably); zero weeks show a baseline stub, not a
 * tiny violet bar pretending to be data. */
function ActivityChart({ weeks }: { weeks: { weekStart: string; events: number }[] }) {
  if (weeks.length === 0) {
    return <EmptyNote className="mt-3">Nothing tracked in the last 8 weeks yet.</EmptyNote>;
  }
  const max = Math.max(...weeks.map((w) => w.events), 1);
  return (
    <div className="mt-4 flex gap-1">
      {weeks.map((week, index) => {
        const pct = week.events === 0 ? 0 : Math.max((week.events / max) * 100, 8);
        // weekStart is a plain date — pin parsing and display to UTC so the
        // label can't drift a day in negative-offset timezones.
        const label = new Date(`${week.weekStart}T00:00:00Z`).toLocaleDateString(
          undefined,
          { month: "short", day: "numeric", timeZone: "UTC" },
        );
        return (
          <div key={week.weekStart} className="group flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="relative flex h-24 items-end">
              {week.events === 0 ? (
                <div className="h-[2px] w-full rounded bg-border" />
              ) : (
                <div
                  className="w-full rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-80"
                  style={{ height: `${pct}%` }}
                />
              )}
              <span className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-background opacity-0 transition-opacity group-hover:opacity-100">
                {week.events}
              </span>
            </div>
            <span
              className={`truncate text-center text-[10px] tabular-nums text-muted-foreground ${index % 2 === 1 ? "hidden sm:block" : ""}`}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const FEED_LABELS: Record<string, string> = {
  "project.created": "Project started",
  "meeting.sent_for_approval": "Summary sent for your approval",
  "meeting.approved": "You approved",
  "meeting.changes_requested": "You requested changes",
  "todo.created": "Deliverable added",
  "todo.completed": "Deliverable completed",
  "todo.reopened": "Deliverable reopened",
  "decision.recorded": "Decision recorded",
  "github.push": "Code pushed",
  "github.pr_opened": "Change proposed",
  "github.pr_merged": "Change shipped",
  "github.issue_opened": "Task opened",
  "github.issue_closed": "Task closed",
  "gitlab.push": "Code pushed",
  "gitlab.mr_opened": "Change proposed",
  "gitlab.mr_merged": "Change shipped",
  "gitlab.issue_opened": "Task opened",
  "gitlab.issue_closed": "Task closed",
  "bitbucket.push": "Code pushed",
  "bitbucket.pr_opened": "Change proposed",
  "bitbucket.pr_merged": "Change shipped",
};

function FeedRow({ event }: { event: FeedEvent }) {
  const Icon =
    event.actor.kind === "ai"
      ? Bot
      : event.actor.kind === "client"
        ? CircleUser
        : event.actor.kind === "integration"
          ? Plug
          : User;
  const title =
    typeof event.payload.title === "string"
      ? event.payload.title
      : typeof event.payload.headMessage === "string"
        ? event.payload.headMessage
        : null;

  return (
    <li className="relative pb-5 pl-6 last:pb-0">
      <span className="absolute -left-[13px] grid size-6 place-items-center rounded-full border border-border bg-card">
        <Icon className="size-3.5 text-muted-foreground" />
      </span>
      <div className="text-sm">
        <span className="font-medium">{FEED_LABELS[event.type] ?? event.type}</span>
        {title ? <span className="text-muted-foreground"> — {title}</span> : null}
      </div>
      <time className="text-xs text-muted-foreground">
        {new Date(event.occurredAt).toLocaleString()}
      </time>
    </li>
  );
}

function EmptyNote({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={`rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground ${className}`}>
      {children}
    </p>
  );
}

/* ── ask: the Relay AI chat ─────────────────────────────────────────────── */

interface Exchange {
  question: string;
  result?: AskResult;
  error?: string;
}

function Ask({ projectId }: { projectId: string }) {
  const [question, setQuestion] = React.useState("");
  const [history, setHistory] = React.useState<Exchange[]>([]);
  const endRef = React.useRef<HTMLDivElement>(null);

  const ask = useMutation({
    mutationFn: (q: string) => portal.ask(projectId, q),
    onSuccess: (result, q) => {
      setHistory((h) =>
        h.map((x) => (x.question === q && !x.result && !x.error ? { ...x, result } : x)),
      );
    },
    onError: (e: unknown, q) => {
      setHistory((h) =>
        h.map((x) =>
          x.question === q && !x.result && !x.error
            ? { ...x, error: e instanceof PortalApiError ? e.message : "Something went wrong." }
            : x,
        ),
      );
    },
  });

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  function submit() {
    const q = question.trim();
    if (!q || ask.isPending) return;
    setHistory((h) => [...h, { question: q }]);
    setQuestion("");
    ask.mutate(q);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Ask anything about your project — answers come from its real history.
        </p>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          <img src="/relay-logo.png" alt="" className="size-10.5" />
          Powered by Relay AI
        </span>
      </div>

      <div className="flex min-h-64 flex-col gap-4">
        {history.length === 0 && (
          <div className="grid flex-1 place-items-center rounded-lg border border-dashed border-border py-12">
            <div className="text-center text-sm text-muted-foreground">
              <p>Try: “What shipped this week?”</p>
              <p>“Why was X decided?” · “What’s still open?”</p>
            </div>
          </div>
        )}
        {history.map((exchange, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="self-end rounded-lg rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
              {exchange.question}
            </div>
            {exchange.result ? (
              <div className="max-w-[85%] self-start rounded-lg rounded-bl-sm border border-border bg-card px-3.5 py-2.5">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{exchange.result.answer}</p>
                {exchange.result.sources.filter((s) => s.cited).length > 0 && (
                  <div className="mt-2.5 flex flex-col gap-1 border-t border-border pt-2">
                    {exchange.result.sources
                      .filter((s) => s.cited)
                      .map((s) => (
                        <div key={s.ref} className="flex items-baseline gap-2 text-xs text-muted-foreground">
                          <span className="shrink-0 font-mono text-primary">[{s.ref}]</span>
                          <span className="min-w-0 truncate">{s.snippet}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            ) : exchange.error ? (
              <p className="self-start text-sm text-destructive">{exchange.error}</p>
            ) : (
              <div className="self-start rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-muted-foreground">
                Thinking…
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about your project…"
          className="h-11 flex-1 rounded-md border border-input bg-transparent px-3.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={ask.isPending || !question.trim()}
          aria-label="Send"
          className="grid size-11 place-items-center rounded-md bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Send className="size-4" />
        </button>
      </form>
    </div>
  );
}

/* ── approvals inbox ────────────────────────────────────────────────────── */

function Approvals() {
  const approvals = useQuery({ queryKey: ["approvals"], queryFn: portal.approvals });

  if (approvals.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  const items = approvals.data ?? [];
  const pending = items.filter((a) => a.status === "PENDING");
  const decided = items.filter((a) => a.status !== "PENDING");

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-2.5 text-sm font-semibold">Waiting on you</h2>
        {pending.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {pending.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{a.meetingTitle}</div>
                  <time className="text-xs text-muted-foreground">
                    sent {new Date(a.createdAt).toLocaleDateString()}
                  </time>
                </div>
                <a
                  href={`${BACKEND_URL}${a.approvePath}`}
                  className="shrink-0 rounded-md bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                >
                  Review
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyNote>Nothing waiting — you’re all caught up.</EmptyNote>
        )}
      </section>

      {decided.length > 0 && (
        <section>
          <h2 className="mb-2.5 text-sm font-semibold">History</h2>
          <ul className="flex flex-col gap-1.5">
            {decided.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3.5 py-2.5"
              >
                <span className="min-w-0 truncate text-sm">{a.meetingTitle}</span>
                <span
                  className={`shrink-0 text-xs font-medium ${a.status === "APPROVED" ? "text-success" : "text-warning"}`}
                >
                  {a.status === "APPROVED" ? "Approved" : "Changes requested"}
                  {a.respondedAt ? ` · ${new Date(a.respondedAt).toLocaleDateString()}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
