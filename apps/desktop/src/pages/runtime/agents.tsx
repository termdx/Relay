import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Play, Plus, Trash2, Workflow, Wrench } from "lucide-react";
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
  const [running, setRunning] = React.useState<{
    id: string;
    name: string;
    model: string;
    mission?: string;
    projects?: string[];
    tools?: string[];
  } | null>(null);

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
                onRun={() => setRunning(a)}
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
      <NewAgentDialog
        cwd={cwd}
        open={newAgent}
        onOpenChange={setNewAgent}
        onDone={() => queryClient.invalidateQueries({ queryKey: ["agents", cwd] })}
      />
      {running && (
        <RunAgentDialog agent={running} onClose={() => setRunning(null)} />
      )}
    </div>
  );
}

function Row({
  icon: Icon,
  title,
  meta,
  onRemove,
  onRun,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  meta: string;
  onRemove: () => void;
  onRun?: () => void;
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
        <Button variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove ${title}`}>
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/** Frictionless run: an agent with a mission + projects starts immediately —
 * one run per bound project, watched live. Legacy agents without a mission
 * fall back to the manual form below. */
function RunAgentDialog({
  agent,
  onClose,
}: {
  agent: {
    id: string;
    name: string;
    model: string;
    mission?: string;
    projects?: string[];
    tools?: string[];
  };
  onClose: () => void;
}) {
  if (agent.mission && (agent.projects?.length ?? 0) > 0) {
    return <MissionRunDialog agent={agent} onClose={onClose} />;
  }
  return <ManualRunDialog agent={agent} onClose={onClose} />;
}

function MissionRunDialog({
  agent,
  onClose,
}: {
  agent: {
    id: string;
    name: string;
    model: string;
    mission?: string;
    projects?: string[];
    tools?: string[];
  };
  onClose: () => void;
}) {
  const [runIds, setRunIds] = React.useState<Record<string, string>>({});
  const [failed, setFailed] = React.useState<Record<string, string>>({});
  const started = React.useRef(false);

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: backend.projects.list,
  });
  const bound = (agent.projects ?? []).filter((id) =>
    (projects.data ?? []).some((p) => p.id === id),
  );

  // Fire immediately — the mission IS the input.
  React.useEffect(() => {
    if (started.current || !projects.data) return;
    started.current = true;
    for (const projectId of bound) {
      backend.agentRuns
        .create({
          agentId: agent.id,
          agentName: agent.name,
          model: agent.model,
          tools: agent.tools,
          projectId,
          instruction: agent.mission!,
        })
        .then((run) => setRunIds((m) => ({ ...m, [projectId]: run.id })))
        .catch((e: unknown) =>
          setFailed((m) => ({
            ...m,
            [projectId]: e instanceof ApiError ? e.message : "Could not start",
          })),
        );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects.data]);

  const projectName = (id: string) => {
    const p = projects.data?.find((x) => x.id === id);
    return p ? `${p.client.name} — ${p.name}` : id;
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{agent.name} is working</DialogTitle>
          <DialogDescription className="line-clamp-2">
            {agent.mission}
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
          {bound.map((projectId) => (
            <div key={projectId} className="rounded-md border border-border p-3">
              <div className="mb-1.5 text-sm font-medium">{projectName(projectId)}</div>
              {failed[projectId] ? (
                <p className="text-sm text-destructive">{failed[projectId]}</p>
              ) : runIds[projectId] ? (
                <RunProgress runId={runIds[projectId]!} />
              ) : (
                <Spinner className="size-4" />
              )}
            </div>
          ))}
          {bound.length === 0 && (
            <p className="text-sm text-muted-foreground">
              None of this agent's projects exist anymore — edit its manifest.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Live status + trace + output for one run. */
function RunProgress({ runId }: { runId: string }) {
  const run = useQuery({
    queryKey: ["agent-run", runId],
    queryFn: () => backend.agentRuns.get(runId),
    refetchInterval: (q) => {
      const status = (q.state.data as AgentRun | undefined)?.status;
      return status === "DONE" || status === "FAILED" ? false : 1500;
    },
  });
  const r = run.data;
  if (!r) return <Spinner className="size-4" />;
  return (
    <div className="flex flex-col gap-2">
      {(r.status === "QUEUED" || r.status === "RUNNING") && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner className="size-3.5" />
          {r.status === "RUNNING" ? "Working…" : "Queued…"}
          {r.trace.length > 0 && ` · ${r.trace.length} tool call(s)`}
        </div>
      )}
      {r.trace.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {r.trace.map((t, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
            >
              <Wrench className="size-2.5" />
              {t.tool}
            </span>
          ))}
        </div>
      )}
      {r.status === "DONE" && (
        <p className="whitespace-pre-wrap rounded bg-accent/40 px-2.5 py-2 text-sm leading-relaxed">
          {r.output}
        </p>
      )}
      {r.status === "FAILED" && (
        <p className="text-sm text-destructive">{r.error}</p>
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
  { tool: "publish_issue", label: "Issue tracker", hint: "file issues in the project repo" },
  { tool: "notify_team", label: "Team chat", hint: "post to Slack / Discord" },
  { tool: "email_owner", label: "Email", hint: "send you reports (never clients)" },
];

function NewAgentDialog({
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
  const [model, setModel] = React.useState("gemini/gemini-flash-latest");
  const [mission, setMission] = React.useState("");
  const [projectIds, setProjectIds] = React.useState<string[]>([]);
  const [tools, setTools] = React.useState<string[]>([]);

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: backend.projects.list,
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () =>
      runtime.agents.create(cwd, {
        id: slug(name),
        name,
        model,
        mission: mission.trim() || undefined,
        projects: projectIds,
        tools,
      }),
    onSuccess: () => {
      toast.success("Agent created — hit Run anytime, no setup needed");
      onDone();
      onOpenChange(false);
      setName("");
      setMission("");
      setProjectIds([]);
      setTools([]);
    },
    onError: (e) => toast.error(e instanceof RuntimeError ? e.message : "Failed"),
  });

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New agent</DialogTitle>
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
              <Label htmlFor="ag-model">Model</Label>
              <Input
                id="ag-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="font-mono text-sm"
              />
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
            Create agent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
