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
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { backend } from "@/lib/api/backend";
import { ApiError } from "@/lib/api/http";
import { runtime, RuntimeError } from "@/lib/api/runtime";
import type { AgentRun } from "@/lib/api/types";
import { useRuntimeWorkspace } from "@/lib/runtime-workspace";
import { Empty, SectionHead } from "./ai";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");

export function RuntimeAgentsPage() {
  const { root } = useRuntimeWorkspace();
  const cwd = root!;
  const queryClient = useQueryClient();
  const [newWorkflow, setNewWorkflow] = React.useState(false);
  const [newAgent, setNewAgent] = React.useState(false);
  const [editing, setEditing] = React.useState<AgentListItem | null>(null);
  const [running, setRunning] = React.useState<AgentListItem | null>(null);
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
    if (bound.length === 0) {
      toast.error("None of this agent's projects exist anymore — edit it.");
      return;
    }
    toast.loading(`${agent.name} is working…`, {
      id: `agent-${agent.id}`,
      position: "top-center",
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflows", cwd] }),
    onError: (e) => toast.error(e instanceof RuntimeError ? e.message : "Remove failed"),
  });
  const removeAgent = useMutation({
    mutationFn: (id: string) => runtime.agents.remove(cwd, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agents", cwd] }),
    onError: (e) => toast.error(e instanceof RuntimeError ? e.message : "Remove failed"),
  });

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
          <Spinner className="size-5" />
        ) : workflows.data && workflows.data.length > 0 ? (
          <div className="space-y-2">
            {workflows.data.map((w) => (
              <Row
                key={w.id}
                icon={Workflow}
                title={w.id}
                meta={w.module ? `module: ${w.module}` : `v${w.version}`}
                onRemove={() => removeWorkflow.mutate(w.id)}
              />
            ))}
          </div>
        ) : (
          <Empty>No workflows yet.</Empty>
        )}
      </div>

      <div>
        <SectionHead
          title="Agents"
          subtitle="Agents. Scaffolds a manifest + starter code."
          action={
            <Button variant="outline" onClick={() => setNewAgent(true)}>
              <Plus className="size-4" />
              New agent
            </Button>
          }
        />
        {agents.isLoading ? (
          <Spinner className="size-5" />
        ) : agents.data && agents.data.length > 0 ? (
          <div className="space-y-2">
            {agents.data.map((a) => (
              <Row
                key={a.id}
                icon={Bot}
                title={a.id}
                meta={`${a.model}${a.workflow ? ` · ${a.workflow}` : ""}`}
                onRemove={() => removeAgent.mutate(a.id)}
                onRun={() =>
                  a.mission && (a.projects?.length ?? 0) > 0
                    ? void startMissionRuns(a)
                    : setRunning(a)
                }
                onEdit={() => setEditing(a)}
              />
            ))}
          </div>
        ) : (
          <Empty>No agents yet.</Empty>
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
  onRemove,
  onRun,
  onEdit,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  meta: string;
  onRemove: () => void;
  onRun?: () => void;
  onEdit?: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-2.5">
        <Icon className="size-4 text-muted-foreground" />
        <span className="font-mono text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{meta}</span>
      </div>
      <div className="flex items-center gap-1">
        {onRun && (
          <Button variant="ghost" size="sm" onClick={onRun}>
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
        const settled = results.every(
          (r) => r.status === "DONE" || r.status === "FAILED",
        );
        if (!settled) {
          const doneCount = results.filter((r) => r.status === "DONE").length;
          const toolCalls = results.reduce((n, r) => n + r.trace.length, 0);
          toast.loading(
            `${agent.name} is working… ${doneCount}/${runs.length} projects` +
              (toolCalls > 0 ? ` · ${toolCalls} tool call(s)` : ""),
            { id: toastId, position: "top-center" },
          );
          setTimeout(() => void tick(), 1500);
          return;
        }
        if (!announced.current) {
          announced.current = true;
          toast.dismiss(toastId);
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
        if (!cancelled) setTimeout(() => void tick(), 3000);
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
          className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ChevronDown
            className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
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
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
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
                onClick={() => start.mutate()}
                disabled={start.isPending || !projectId || !instruction.trim()}
              >
                {start.isPending ? <Spinner className="size-4" /> : <Play className="size-4" />}
                Run agent
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
            {!finished && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New workflow</DialogTitle>
          <DialogDescription>Creates workflows/&lt;id&gt;.yaml + a scaffold.</DialogDescription>
        </DialogHeader>
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
          <Button onClick={() => create.mutate()} disabled={!slug(name) || create.isPending}>
            {create.isPending && <Spinner className="size-4" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const INTEGRATION_TOOLS: { tool: string; label: string; hint: string }[] = [
  { tool: "publish_issue", label: "Issue tracker", hint: "read & file issues in the project repo" },
  { tool: "notify_team", label: "Team chat", hint: "post to Slack / Discord" },
  { tool: "email_owner", label: "Email", hint: "send you reports (never clients)" },
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
        const found = lists.flat().filter(toolCapable);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.id}` : "New agent"}</DialogTitle>
          <DialogDescription>
            A mission + projects + granted integrations. Run executes the
            mission with zero further input.
          </DialogDescription>
        </DialogHeader>
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
              <Label>Model</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger className="font-mono text-xs">
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

          <div className="flex flex-col gap-1.5">
            <Label>Projects</Label>
            {projects.data && projects.data.length > 0 ? (
              <div className="flex flex-col gap-1">
                {projects.data.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent/40"
                  >
                    <input
                      type="checkbox"
                      checked={projectIds.includes(p.id)}
                      onChange={() => setProjectIds((l) => toggle(l, p.id))}
                      className="size-4 accent-[var(--primary)]"
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
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Integrations the agent may use</Label>
            <div className="flex flex-col gap-1">
              {INTEGRATION_TOOLS.map((integration) => (
                <label
                  key={integration.tool}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent/40"
                >
                  <input
                    type="checkbox"
                    checked={tools.includes(integration.tool)}
                    onChange={() => setTools((l) => toggle(l, integration.tool))}
                    className="size-4 accent-[var(--primary)]"
                  />
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
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => create.mutate()}
            disabled={
              !slug(name) ||
              !model ||
              !mission.trim() ||
              projectIds.length === 0 ||
              create.isPending
            }
          >
            {create.isPending && <Spinner className="size-4" />}
            {editing ? "Save changes" : "Create agent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
