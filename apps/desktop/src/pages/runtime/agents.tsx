import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  Pencil,
  Play,
  Plus,
  Trash2,
  Workflow,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import * as React from "react";
import { toast } from "@/lib/toast";
import { appUnfocused, nativeNotify } from "@/lib/notify";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { IntegrationIcon } from "@/components/integration-icon";
import { SectionHead } from "@/components/section-head";
import { EmptyState, ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { backend } from "@/lib/api/backend";
import { ApiError } from "@/lib/api/http";
import { runtime, RuntimeError } from "@/lib/api/runtime";
import type { AgentRun } from "@/lib/api/types";
import { useRuntimeWorkspace } from "@/lib/runtime-workspace";
import { cn } from "@/lib/utils";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * OpenRouter's public model catalog, filtered to free models that advertise
 * tool calling — the only ones an agent can actually drive. Prefixed
 * "openrouter/" so the executor routes them to the OpenAI-style loop.
 */
async function openRouterFreeToolModels(): Promise<string[]> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models");
    if (!res.ok) return OPENROUTER_FREE_FALLBACK;
    const data = (await res.json()) as {
      data?: { id?: string; supported_parameters?: string[] }[];
    };
    const found = (data.data ?? [])
      .filter(
        (m) =>
          typeof m.id === "string" &&
          m.id.endsWith(":free") &&
          Array.isArray(m.supported_parameters) &&
          m.supported_parameters.includes("tools"),
      )
      .map((m) => `openrouter/${m.id}`)
      .sort();
    return found.length > 0 ? found : OPENROUTER_FREE_FALLBACK;
  } catch {
    return OPENROUTER_FREE_FALLBACK;
  }
}

/**
 * Only used if the live catalog can't be reached. OpenRouter's free tier
 * rotates, so these can go stale — the dynamic fetch above is authoritative.
 */
const OPENROUTER_FREE_FALLBACK = [
  "openrouter/openai/gpt-oss-20b:free",
  "openrouter/google/gemma-4-31b-it:free",
  "openrouter/nvidia/nemotron-nano-9b-v2:free",
];

export function RuntimeAgentsPage() {
  const { root } = useRuntimeWorkspace();
  const cwd = root!;
  const queryClient = useQueryClient();
  const [newWorkflow, setNewWorkflow] = React.useState(false);
  const [newAgent, setNewAgent] = React.useState(false);
  const [editing, setEditing] = React.useState<AgentListItem | null>(null);
  const [running, setRunning] = React.useState<AgentListItem | null>(null);
  const [removeTarget, setRemoveTarget] = React.useState<
    { kind: "workflow" | "agent"; id: string } | null
  >(null);
  const [watching, setWatching] = React.useState<
    { agent: AgentListItem; runs: { projectId: string; runId: string }[] }[]
  >([]);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: backend.projects.list,
  });

  /** Mission agents run with zero friction: fire, then watch via toast. */
  async function startMissionRuns(agent: AgentListItem) {
    const bound = (agent.projects ?? []).filter((id) =>
      (projectsQuery.data ?? []).some((p) => p.id === id),
    );
    const lost = (agent.projects?.length ?? 0) - bound.length;
    if (bound.length === 0) {
      toast.error("None of this agent's projects exist anymore — edit it.");
      return;
    }
    if (lost > 0) {
      toast.warning(
        `${lost} bound project${lost > 1 ? "s" : ""} no longer exist${lost > 1 ? "" : "s"} — running on the remaining ${bound.length}.`,
      );
    }
    toast.loading(`${agent.name} is working…`, {
      id: `agent-${agent.id}`,
      position: "top-center",
      description: "starting runs…",
    });
    try {
      const runs = await Promise.all(
        bound.map((projectId) =>
          backend.agentRuns
            .create({
              agentId: agent.id,
              agentName: agent.name,
              model: agent.model,
              tools: agent.tools,
              projectId,
              instruction: agent.mission!,
            })
            .then((run) => ({ projectId, runId: run.id })),
        ),
      );
      setWatching((w) => [...w.filter((x) => x.agent.id !== agent.id), { agent, runs }]);
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "Could not start the agent",
        { id: `agent-${agent.id}`, position: "top-center" },
      );
    }
  }

  const workflows = useQuery({
    queryKey: ["workflows", cwd],
    queryFn: () => runtime.workflows.list(cwd),
  });
  const agents = useQuery({
    queryKey: ["agents", cwd],
    queryFn: () => runtime.agents.list(cwd),
  });

  const removeWorkflow = useMutation({
    mutationFn: (id: string) => runtime.workflows.remove(cwd, id),
    onSuccess: (_r, id) => {
      toast.success(`Removed workflow "${id}"`);
      queryClient.invalidateQueries({ queryKey: ["workflows", cwd] });
    },
    onError: (e) => toast.error(e instanceof RuntimeError ? e.message : "Remove failed"),
  });
  const removeAgent = useMutation({
    mutationFn: (id: string) => runtime.agents.remove(cwd, id),
    onSuccess: (_r, id) => {
      toast.success(`Removed agent "${id}"`);
      queryClient.invalidateQueries({ queryKey: ["agents", cwd] });
    },
    onError: (e) => toast.error(e instanceof RuntimeError ? e.message : "Remove failed"),
  });

  const isMissionAgent = (a: AgentListItem) =>
    Boolean(a.mission) && (a.projects?.length ?? 0) > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <SectionHead
          title="Workflows"
          subtitle="Declarative processes the runtime orchestrates."
          action={
            <Button variant="outline" onClick={() => setNewWorkflow(true)}>
              <Plus className="size-4" />
              New workflow
            </Button>
          }
        />
        {workflows.isLoading ? (
          <RowSkeletons />
        ) : workflows.isError ? (
          <ErrorState
            title="Couldn't load workflows"
            onRetry={() => workflows.refetch()}
          />
        ) : workflows.data && workflows.data.length > 0 ? (
          <div className="space-y-2">
            {workflows.data.map((w) => (
              <Row
                key={w.id}
                icon={Workflow}
                title={w.displayName ?? w.id}
                meta={w.module ? `module: ${w.module}` : `v${w.version}`}
                onRemove={() => setRemoveTarget({ kind: "workflow", id: w.id })}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Workflow}
            title="No workflows yet"
            description="Scaffold one — you get a manifest and starter code to build on."
          />
        )}
      </div>

      <div>
        <SectionHead
          title="Agents"
          subtitle="Mission-driven workers that run across your projects on demand."
          action={
            <Button variant="outline" onClick={() => setNewAgent(true)}>
              <Plus className="size-4" />
              New agent
            </Button>
          }
        />
        {agents.isLoading ? (
          <RowSkeletons />
        ) : agents.isError ? (
          <ErrorState
            title="Couldn't load agents"
            onRetry={() => agents.refetch()}
          />
        ) : agents.data && agents.data.length > 0 ? (
          <div className="space-y-2">
            {agents.data.map((a) => (
              <Row
                key={a.id}
                icon={Bot}
                title={a.name}
                meta={`${a.id} · ${a.model}${a.workflow ? ` · ${a.workflow}` : ""}`}
                badges={
                  isMissionAgent(a) ? (
                    <Badge variant="primary">mission</Badge>
                  ) : undefined
                }
                runDisabled={watching.some((w) => w.agent.id === a.id)}
                onRemove={() => setRemoveTarget({ kind: "agent", id: a.id })}
                onRun={() =>
                  isMissionAgent(a) ? void startMissionRuns(a) : setRunning(a)
                }
                onEdit={() => setEditing(a)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Bot}
            title="No agents yet"
            description="Create one with a mission and projects — then fire it with a single Run."
            action={
              <Button size="sm" variant="outline" onClick={() => setNewAgent(true)}>
                <Plus className="size-4" />
                New agent
              </Button>
            }
          />
        )}
      </div>

      <NewWorkflowDialog
        cwd={cwd}
        open={newWorkflow}
        onOpenChange={setNewWorkflow}
        onDone={() => queryClient.invalidateQueries({ queryKey: ["workflows", cwd] })}
      />
      <AgentDialog
        cwd={cwd}
        open={newAgent}
        onOpenChange={setNewAgent}
        onDone={() => queryClient.invalidateQueries({ queryKey: ["agents", cwd] })}
      />
      {editing && (
        <AgentDialog
          cwd={cwd}
          open
          editing={editing}
          onOpenChange={(v) => !v && setEditing(null)}
          onDone={() => queryClient.invalidateQueries({ queryKey: ["agents", cwd] })}
        />
      )}
      {running && (
        <ManualRunDialog agent={running} onClose={() => setRunning(null)} />
      )}
      {watching.map((w) => (
        <AgentRunWatcher
          key={w.agent.id}
          agent={w.agent}
          runs={w.runs}
          projectName={(id) => {
            const p = projectsQuery.data?.find((x) => x.id === id);
            return p ? `${p.client.name} — ${p.name}` : id;
          }}
          onSettled={() =>
            setWatching((list) => list.filter((x) => x.agent.id !== w.agent.id))
          }
        />
      ))}

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title={`Remove ${removeTarget?.kind} "${removeTarget?.id}"?`}
        description={
          removeTarget?.kind === "agent"
            ? "Its mission and project bindings are deleted. Run history is kept."
            : "The workflow manifest is removed from this workspace."
        }
        confirmLabel={`Remove ${removeTarget?.kind ?? ""}`}
        destructive
        onConfirm={() => {
          if (!removeTarget) return;
          if (removeTarget.kind === "workflow") removeWorkflow.mutate(removeTarget.id);
          else removeAgent.mutate(removeTarget.id);
          setRemoveTarget(null);
        }}
      />
    </div>
  );
}

function RowSkeletons() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {[0, 1].map((i) => (
        <Skeleton key={i} className="h-13 w-full" />
      ))}
    </div>
  );
}

interface AgentListItem {
  id: string;
  name: string;
  model: string;
  mission?: string;
  projects?: string[];
  tools?: string[];
  workflow?: string;
}

function Row({
  icon: Icon,
  title,
  meta,
  badges,
  runDisabled,
  onRemove,
  onRun,
  onEdit,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  meta: string;
  badges?: React.ReactNode;
  runDisabled?: boolean;
  onRemove: () => void;
  onRun?: () => void;
  onEdit?: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate font-mono text-sm font-medium">{title}</span>
        <span className="truncate text-xs text-muted-foreground">{meta}</span>
        {badges}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {onRun && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRun}
            disabled={runDisabled}
            title={runDisabled ? "Already running" : undefined}
          >
            <Play className="size-4" />
            Run
          </Button>
        )}
        {onEdit && (
          <Button variant="ghost" size="icon" onClick={onEdit} aria-label={`Edit ${title}`}>
            <Pencil className="size-4" />
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove ${title}`}>
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/** Stop polling after ~2 minutes of consecutive API failures. */
const MAX_WATCH_FAILURES = 40;

/**
 * Headless watcher: polls the agent's runs, keeps the top-center loading
 * toast fresh, and when everything settles swaps it for the expandable
 * "did its work" toast. Renders nothing.
 */
function AgentRunWatcher({
  agent,
  runs,
  projectName,
  onSettled,
}: {
  agent: AgentListItem;
  runs: { projectId: string; runId: string }[];
  projectName: (id: string) => string;
  onSettled: () => void;
}) {
  const announced = React.useRef(false);
  const failures = React.useRef(0);

  React.useEffect(() => {
    let cancelled = false;
    const toastId = `agent-${agent.id}`;

    const tick = async () => {
      if (cancelled) return;
      try {
        const results = await Promise.all(
          runs.map((r) => backend.agentRuns.get(r.runId)),
        );
        if (cancelled) return;
        failures.current = 0;
        const settled = results.every(
          (r) => r.status === "DONE" || r.status === "FAILED",
        );
        if (!settled) {
          const doneCount = results.filter((r) => r.status === "DONE").length;
          const toolCalls = results.reduce((n, r) => n + r.trace.length, 0);
          toast.loading(`${agent.name} is working…`, {
            id: toastId,
            position: "top-center",
            description:
              `${doneCount}/${runs.length} project(s)` +
              (toolCalls > 0 ? ` · ${toolCalls} tool call(s)` : ""),
          });
          setTimeout(() => void tick(), 1500);
          return;
        }
        if (!announced.current) {
          announced.current = true;
          toast.dismiss(toastId);
          const failed = results.filter((r) => r.status === "FAILED").length;
          if (appUnfocused()) {
            void nativeNotify(
              failed === 0
                ? `${agent.name} did its work`
                : `${agent.name} finished with ${failed} failure(s)`,
              results
                .map((r) => (r.output ?? r.error ?? "").slice(0, 120))
                .join(" · ")
                .slice(0, 240),
            );
          }
          toast.custom(
            (t) => (
              <AgentDoneToast
                agent={agent}
                results={runs.map((r, i) => ({
                  projectId: r.projectId,
                  run: results[i]!,
                }))}
                projectName={projectName}
                onDismiss={() => toast.dismiss(t)}
              />
            ),
            { position: "top-center", duration: Infinity },
          );
          onSettled();
        }
      } catch {
        if (cancelled) return;
        failures.current += 1;
        if (failures.current >= MAX_WATCH_FAILURES) {
          toast.error(`${agent.name}: lost contact with the backend — check the run history.`, {
            id: `agent-${agent.id}`,
          });
          onSettled();
          return;
        }
        setTimeout(() => void tick(), 3000);
      }
    };
    void tick();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

/** The completion toast: one line + chevron; expands into the full report. */
function AgentDoneToast({
  agent,
  results,
  projectName,
  onDismiss,
}: {
  agent: AgentListItem;
  results: { projectId: string; run: AgentRun }[];
  projectName: (id: string) => string;
  onDismiss: () => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const failures = results.filter((r) => r.run.status === "FAILED").length;
  const toolCalls = results.reduce((n, r) => n + r.run.trace.length, 0);
  const ok = failures === 0;

  return (
    <div className="w-[420px] max-w-[90vw] rounded-lg border border-border bg-card p-3.5 shadow-lg">
      <div className="flex items-center gap-2.5">
        {ok ? (
          <CheckCircle2 className="size-4.5 shrink-0 text-success" />
        ) : (
          <XCircle className="size-4.5 shrink-0 text-destructive" />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">
            {ok
              ? `${agent.name} did its work`
              : `${agent.name} finished with ${failures} failure(s)`}
          </div>
          <div className="text-xs text-muted-foreground">
            {results.length} project(s) · {toolCalls} tool call(s)
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Collapse report" : "Expand report"}
          className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown
            className={cn(
              "size-4 transition-transform",
              expanded && "rotate-180",
            )}
          />
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" />
        </button>
      </div>

      {expanded && (
        <div className="mt-3 flex max-h-72 flex-col gap-2.5 overflow-y-auto border-t border-border pt-3">
          {results.map(({ projectId, run }) => (
            <div key={projectId}>
              <div className="mb-1 flex items-center gap-2">
                <span className="text-xs font-medium">{projectName(projectId)}</span>
                {run.trace.map((t, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded border border-border px-1 py-px font-mono text-[9px] text-muted-foreground"
                  >
                    <Wrench className="size-2.5" />
                    {t.tool}
                  </span>
                ))}
              </div>
              {run.status === "DONE" ? (
                <p className="whitespace-pre-wrap rounded bg-accent/40 px-2.5 py-2 text-xs leading-relaxed">
                  {run.output}
                </p>
              ) : (
                <p className="text-xs text-destructive">{run.error}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ManualRunDialog({
  agent,
  onClose,
}: {
  agent: { id: string; name: string; model: string; tools?: string[] };
  onClose: () => void;
}) {
  const [projectId, setProjectId] = React.useState("");
  const [instruction, setInstruction] = React.useState("");
  const [runId, setRunId] = React.useState<string | null>(null);

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: backend.projects.list,
  });

  const start = useMutation({
    mutationFn: () =>
      backend.agentRuns.create({
        agentId: agent.id,
        agentName: agent.name,
        model: agent.model,
        tools: agent.tools,
        projectId,
        instruction: instruction.trim(),
      }),
    onSuccess: (run) => setRunId(run.id),
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Could not start the run"),
  });

  const run = useQuery({
    queryKey: ["agent-run", runId],
    queryFn: () => backend.agentRuns.get(runId!),
    enabled: Boolean(runId),
    refetchInterval: (q) => {
      const status = (q.state.data as AgentRun | undefined)?.status;
      return status === "DONE" || status === "FAILED" ? false : 1500;
    },
  });

  const result = run.data;
  const finished = result?.status === "DONE" || result?.status === "FAILED";

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!start.isPending && projectId && instruction.trim()) start.mutate();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Run {agent.name}</DialogTitle>
          <DialogDescription>
            The agent works with real project data: knowledge search, todos,
            decisions, timeline. Writes land attributed to it.
          </DialogDescription>
        </DialogHeader>

        {!runId ? (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="run-project">Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger id="run-project">
                  <SelectValue placeholder="Pick a project" />
                </SelectTrigger>
                <SelectContent>
                  {(projects.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.client.name} — {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="run-instruction">Instruction</Label>
              <Textarea
                id="run-instruction"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="Summarize what happened this week and create todos for anything left open…"
                className="min-h-24"
              />
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={start.isPending || !projectId || !instruction.trim()}
              >
                {start.isPending ? <Spinner className="size-4" /> : <Play className="size-4" />}
                Run agent
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
            {!finished && (
              <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner className="size-4" />
                {result?.status === "RUNNING" ? "Working…" : "Queued…"}
              </div>
            )}
            {result?.trace && result.trace.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {result.trace.map((entry, i) => (
                  <div key={i} className="rounded-md border border-border px-3 py-2">
                    <div className="flex items-center gap-2 font-mono text-xs font-medium">
                      <Wrench className="size-3 text-muted-foreground" />
                      {entry.tool}
                    </div>
                    <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
                      {entry.result}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {result?.status === "DONE" && (
              <p className="whitespace-pre-wrap rounded-md bg-accent/40 px-3 py-2.5 text-sm leading-relaxed">
                {result.output}
              </p>
            )}
            {result?.status === "FAILED" && (
              <p className="text-sm text-destructive">{result.error}</p>
            )}
            {finished && (
              <DialogFooter>
                <Button variant="outline" onClick={() => setRunId(null)}>
                  Run again
                </Button>
                <Button onClick={onClose}>Done</Button>
              </DialogFooter>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function NewWorkflowDialog({
  cwd,
  open,
  onOpenChange,
  onDone,
}: {
  cwd: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [name, setName] = React.useState("");
  const create = useMutation({
    mutationFn: () =>
      runtime.workflows.create(cwd, { id: slug(name), displayName: name }),
    onSuccess: () => {
      toast.success("Workflow scaffolded");
      onDone();
      onOpenChange(false);
      setName("");
    },
    onError: (e) => toast.error(e instanceof RuntimeError ? e.message : "Failed"),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (slug(name) && !create.isPending) create.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New workflow</DialogTitle>
          <DialogDescription>Creates workflows/&lt;id&gt;.yaml + a scaffold.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wf-name">Name</Label>
            <Input
              id="wf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Meeting processing"
              autoFocus
            />
            {name && (
              <p className="text-xs text-muted-foreground">
                id: <span className="font-mono">{slug(name)}</span>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!slug(name) || create.isPending}>
              {create.isPending && <Spinner className="size-4" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const INTEGRATION_TOOLS: {
  tool: string;
  label: string;
  hint: string;
  /** Provider marks shown next to the label. */
  icons: string[];
}[] = [
  {
    tool: "publish_issue",
    label: "Repo access",
    hint: "issues in/out + CI status",
    icons: ["github", "gitlab", "bitbucket"],
  },
  {
    tool: "notify_team",
    label: "Team chat",
    hint: "post to Slack / Discord",
    icons: ["slack", "discord"],
  },
  {
    tool: "email_owner",
    label: "Email",
    hint: "send you reports (never clients)",
    icons: ["smtp"],
  },
];

function AgentDialog({
  cwd,
  open,
  onOpenChange,
  onDone,
  editing,
}: {
  cwd: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
  editing?: AgentListItem;
}) {
  const [name, setName] = React.useState(editing?.name ?? "");
  const [model, setModel] = React.useState(
    editing?.model ?? "gemini/gemini-flash-latest",
  );
  const [mission, setMission] = React.useState(editing?.mission ?? "");
  const [projectIds, setProjectIds] = React.useState<string[]>(
    editing?.projects ?? [],
  );
  const [tools, setTools] = React.useState<string[]>(editing?.tools ?? []);

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: backend.projects.list,
    enabled: open,
  });

  // Live model options from installed AI providers; curated fallback if the
  // probe fails or nothing is installed yet.
  const modelOptions = useQuery({
    queryKey: ["agent-model-options", cwd],
    enabled: open,
    queryFn: async () => {
      const fallback = [
        "gemini/gemini-flash-latest",
        "gemini/gemini-3.5-flash",
        "gemini/gemini-flash-lite-latest",
      ];
      // Agents need function calling: keep Gemini text models, drop Gemma
      // (no tool support on the API), image/TTS/embedding/specialty models.
      const toolCapable = (name: string) =>
        /\/gemini-/.test(name) &&
        !/(image|tts|embed|audio|live|computer-use|research|preview-tts)/.test(name);
      try {
        const providers = await runtime.ai.list(cwd);
        const lists = await Promise.all(
          providers.map((p) =>
            runtime.ai
              .models(cwd, p.id)
              .then((models) => models.map((m) => `${p.provider}/${m}`))
              .catch(() => [] as string[]),
          ),
        );
        const gemini = lists.flat().filter(toolCapable);
        // If an OpenRouter provider is connected, add its free, tool-capable
        // models — a separate quota pool from Gemini, so agents keep running
        // when the Gemini free tier is throttled.
        const openrouter = providers.some((p) => p.provider === "openrouter")
          ? await openRouterFreeToolModels()
          : [];
        const found = [...gemini, ...openrouter];
        return found.length > 0 ? found : fallback;
      } catch {
        return fallback;
      }
    },
  });

  const options = React.useMemo(() => {
    const list = modelOptions.data ?? [];
    // Keep the current value selectable even if the probe doesn't list it.
    return model && !list.includes(model) ? [model, ...list] : list;
  }, [modelOptions.data, model]);

  const create = useMutation({
    mutationFn: () => {
      const fields = {
        name,
        model,
        mission: mission.trim(),
        projects: projectIds,
        tools,
      };
      return editing
        ? runtime.agents.update(cwd, editing.id, fields)
        : runtime.agents.create(cwd, { id: slug(name), ...fields, mission: fields.mission || undefined });
    },
    onSuccess: () => {
      toast.success(
        editing ? "Agent updated" : "Agent created — hit Run anytime, no setup needed",
      );
      onDone();
      onOpenChange(false);
      if (!editing) {
        setName("");
        setMission("");
        setProjectIds([]);
        setTools([]);
      }
    },
    onError: (e) => toast.error(e instanceof RuntimeError ? e.message : "Failed"),
  });

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const canSubmit =
    Boolean(slug(name)) &&
    Boolean(model) &&
    Boolean(mission.trim()) &&
    projectIds.length > 0;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (canSubmit && !create.isPending) create.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.id}` : "New agent"}</DialogTitle>
          <DialogDescription>
            A mission + projects + granted integrations. Run executes the
            mission with zero further input.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ag-name">Name</Label>
                <Input
                  id="ag-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Weekly reviewer"
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ag-model">Model</Label>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger id="ag-model" className="font-mono text-xs">
                    <SelectValue placeholder="Pick a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((option) => (
                      <SelectItem key={option} value={option} className="font-mono text-xs">
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Gemini only — agents need function calling. Other providers
                  power drafts, chat &amp; embeddings.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ag-mission">Mission</Label>
              <Textarea
                id="ag-mission"
                value={mission}
                onChange={(e) => setMission(e.target.value)}
                placeholder="Review recent activity, summarize progress, create todos for anything dropped, and notify the team."
                className="min-h-20"
              />
              <p className="text-xs text-muted-foreground">
                The standing instruction every run executes.
              </p>
            </div>

            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-sm font-medium leading-none">Projects</legend>
              {projects.data && projects.data.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {projects.data.map((p) => (
                    <label
                      key={p.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/40"
                    >
                      <Checkbox
                        checked={projectIds.includes(p.id)}
                        onCheckedChange={() => setProjectIds((l) => toggle(l, p.id))}
                      />
                      <span className="text-sm">
                        {p.client.name} — {p.name}
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No projects yet — create one under Clients first.
                </p>
              )}
            </fieldset>

            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-sm font-medium leading-none">
                Integrations the agent may use
              </legend>
              <div className="flex flex-col gap-1">
                {INTEGRATION_TOOLS.map((integration) => (
                  <label
                    key={integration.tool}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/40"
                  >
                    <Checkbox
                      checked={tools.includes(integration.tool)}
                      onCheckedChange={() => setTools((l) => toggle(l, integration.tool))}
                    />
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      {integration.icons.map((id) => (
                        <IntegrationIcon key={id} id={id} className="size-3.5" />
                      ))}
                    </span>
                    <span className="text-sm">{integration.label}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {integration.hint}
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Project data (knowledge, todos, decisions, timeline) is always
                available. These grant real outside reach.
              </p>
            </fieldset>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!canSubmit || create.isPending}>
              {create.isPending && <Spinner className="size-4" />}
              {editing ? "Save changes" : "Create agent"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
