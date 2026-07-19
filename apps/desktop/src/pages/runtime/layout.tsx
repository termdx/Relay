import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, FolderPlus, Plus, Server } from "lucide-react";
import * as React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { EmptyState, LoadingState } from "@/components/states";
import { PageHeader } from "@/components/page-header";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const { daemon, isLoading, root, retry } = useRuntimeWorkspace();

  if (isLoading) {
    return <LoadingState label="Connecting to the runtime daemon…" />;
  }

  if (!daemon) {
    return (
      <div className="px-8 py-6">
        <EmptyState
          icon={Server}
          title="Runtime daemon isn't running"
          description={
            <>
              Start it with{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                pnpm --filter @relay/cli relay daemon start
              </code>
              . This page checks again every 5 seconds.
            </>
          }
          action={
            <Button variant="outline" size="sm" onClick={retry}>
              Check again
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Runtime"
        description={<WorkspaceSwitcher />}
        tabs={
          <nav aria-label="Runtime sections" className="-mb-px -ml-3 flex gap-1">
            {TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  cn(
                    "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
        }
      />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {root ? <Outlet /> : <LoadingState label="Loading workspace…" />}
      </div>
    </div>
  );
}

function WorkspaceSwitcher() {
  const { root, setRoot } = useRuntimeWorkspace();
  const [creating, setCreating] = React.useState(false);
  const workspaces = useQuery({
    queryKey: ["workspaces"],
    queryFn: runtime.workspaces.list,
  });

  const current = workspaces.data?.find((w) => w.root === root);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="-ml-1 flex items-center gap-1.5 rounded-sm px-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="font-mono">{current?.name ?? "workspace"}</span>
            <span className="text-xs opacity-70">{current?.organization}</span>
            <ChevronDown className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {workspaces.data?.map((w) => (
            <DropdownMenuItem
              key={w.root}
              onSelect={() => setRoot(w.root)}
              className="flex items-center justify-between"
            >
              <span>
                <span className="font-mono">{w.name}</span>{" "}
                <span className="text-xs text-muted-foreground">
                  {w.organization}
                </span>
              </span>
              {w.root === root && <Check className="size-4 text-primary" />}
            </DropdownMenuItem>
          ))}
          {workspaces.data && workspaces.data.length > 0 && (
            <DropdownMenuSeparator />
          )}
          <DropdownMenuItem onSelect={() => setCreating(true)}>
            <FolderPlus />
            New workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateWorkspaceDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(root) => setRoot(root)}
      />
    </>
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

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (name && !create.isPending) create.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New workspace</DialogTitle>
          <DialogDescription>
            Created under <code className="font-mono">~/.relay/workspaces</code>.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
          <DialogFooter>
            <Button type="submit" disabled={!name || create.isPending}>
              {create.isPending ? <Spinner className="size-4" /> : <Plus className="size-4" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
