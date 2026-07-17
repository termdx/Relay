import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, FolderPlus, Plus } from "lucide-react";
import * as React from "react";
import { NavLink, Outlet } from "react-router-dom";
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
import { Spinner } from "@/components/ui/spinner";
import { runtime } from "@/lib/api/runtime";
import { RuntimeError } from "@/lib/api/runtime";
import { useRuntimeWorkspace } from "@/lib/runtime-workspace";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/runtime", label: "Overview", end: true },
  { to: "/runtime/ai", label: "AI providers" },
  { to: "/runtime/modules", label: "Modules" },
  { to: "/runtime/integrations", label: "Integrations" },
  { to: "/runtime/agents", label: "Agents & workflows" },
];

export function RuntimeLayout() {
  const { daemon, isLoading, root } = useRuntimeWorkspace();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Spinner className="size-5" />
      </div>
    );
  }

  if (!daemon) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <p className="font-medium">Runtime daemon isn’t running</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Start it with{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              pnpm --filter @relay/cli relay daemon start
            </code>
            . It auto-creates a default workspace.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-border px-8 pt-5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Runtime</h1>
          <WorkspaceSwitcher />
        </div>
      </div>
      <nav className="flex gap-1 border-b border-border px-6">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                "border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <div className="flex-1 overflow-y-auto p-8">
        {root ? <Outlet /> : <Spinner className="size-5" />}
      </div>
    </div>
  );
}

function WorkspaceSwitcher() {
  const { root, setRoot } = useRuntimeWorkspace();
  const [open, setOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const workspaces = useQuery({
    queryKey: ["workspaces"],
    queryFn: runtime.workspaces.list,
  });

  const current = workspaces.data?.find((w) => w.root === root);

  return (
    <div className="relative mt-0.5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <span className="font-mono">{current?.name ?? "workspace"}</span>
        <span className="text-xs opacity-70">{current?.organization}</span>
        <ChevronDown className="size-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-7 z-20 w-64 rounded-md border border-border bg-popover p-1 shadow-md">
            {workspaces.data?.map((w) => (
              <button
                key={w.root}
                onClick={() => {
                  setRoot(w.root);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              >
                <span>
                  <span className="font-mono">{w.name}</span>{" "}
                  <span className="text-xs text-muted-foreground">
                    {w.organization}
                  </span>
                </span>
                {w.root === root && <Check className="size-4" />}
              </button>
            ))}
            <div className="my-1 border-t border-border" />
            <button
              onClick={() => {
                setCreating(true);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <FolderPlus className="size-4" />
              New workspace
            </button>
          </div>
        </>
      )}
      <CreateWorkspaceDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(root) => setRoot(root)}
      />
    </div>
  );
}

function CreateWorkspaceDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (root: string) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState("");
  const [org, setOrg] = React.useState("");

  const create = useMutation({
    mutationFn: () => runtime.workspaces.create(name, org || name),
    onSuccess: (ws) => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      onCreated(ws.root);
      onOpenChange(false);
      setName("");
      setOrg("");
      toast.success(`Workspace "${ws.name}" created`);
    },
    onError: (e) =>
      toast.error(e instanceof RuntimeError ? e.message : "Could not create workspace"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New workspace</DialogTitle>
          <DialogDescription>
            Created under <code className="font-mono">~/.relay/workspaces</code>.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ws-name">Name</Label>
            <Input
              id="ws-name"
              value={name}
              onChange={(e) => setName(e.target.value.replace(/[^a-z0-9-]/g, ""))}
              placeholder="acme"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Lowercase, digits and dashes.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ws-org">Organization</Label>
            <Input
              id="ws-org"
              value={org}
              onChange={(e) => setOrg(e.target.value)}
              placeholder="Acme Studio"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => create.mutate()}
            disabled={!name || create.isPending}
          >
            {create.isPending ? <Spinner className="size-4" /> : <Plus className="size-4" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
