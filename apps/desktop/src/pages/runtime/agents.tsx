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
                onRun={() =>
                  setRunning({ id: a.id, name: a.name, model: a.model })
                }
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

/** Run an agent against a project and watch the tool loop live. */
function RunAgentDialog({
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

  const create = useMutation({
    mutationFn: () =>
      runtime.agents.create(cwd, { id: slug(name), name, model }),
    onSuccess: () => {
      toast.success("Agent scaffolded (+ starter code)");
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
          <DialogTitle>New agent</DialogTitle>
          <DialogDescription>
            Creates agents/&lt;id&gt;.yaml. Run it on any project from the list.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ag-name">Name</Label>
            <Input
              id="ag-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Summarizer"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ag-model">Model</Label>
            <Input
              id="ag-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="provider/model"
              className="font-mono text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => create.mutate()}
            disabled={!slug(name) || !model || create.isPending}
          >
            {create.isPending && <Spinner className="size-4" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
