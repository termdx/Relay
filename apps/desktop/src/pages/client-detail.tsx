import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FolderGit2, Plus } from "lucide-react";
import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { backend } from "@/lib/api/backend";
import { ApiError } from "@/lib/api/http";
import type { ProjectStatus } from "@/lib/api/types";

const PROJECT_STATUS_META: Record<
  ProjectStatus,
  { label: string; variant: "success" | "warning" | "outline" }
> = {
  ACTIVE: { label: "Active", variant: "success" },
  PAUSED: { label: "Paused", variant: "warning" },
  COMPLETED: { label: "Completed", variant: "outline" },
};

export function ClientDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const client = useQuery({
    queryKey: ["clients", id],
    queryFn: () => backend.clients.get(id),
    enabled: Boolean(id),
  });

  if (client.isLoading) {
    return (
      <div className="flex justify-center py-16 text-muted-foreground">
        <Spinner className="size-5" />
      </div>
    );
  }
  if (client.isError || !client.data) {
    return (
      <div className="px-8 py-6">
        <p className="text-sm text-destructive">Couldn’t load this client.</p>
        <Button variant="outline" asChild className="mt-4">
          <Link to="/clients">
            <ArrowLeft className="size-4" />
            Back to clients
          </Link>
        </Button>
      </div>
    );
  }

  const c = client.data;
  return (
    <>
      <PageHeader
        title={c.name}
        description={[c.company, c.email].filter(Boolean).join(" · ")}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/clients">
                <ArrowLeft className="size-4" />
                Back
              </Link>
            </Button>
            <NewProjectDialog clientId={c.id} />
          </div>
        }
      />

      <div className="px-8 py-6">
        {c.notes ? (
          <p className="mb-6 max-w-2xl whitespace-pre-wrap text-sm text-muted-foreground">
            {c.notes}
          </p>
        ) : null}

        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Projects
        </h2>
        {c.projects.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Project</th>
                  <th className="px-4 py-2.5 font-medium">Repo</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {c.projects.map((p) => {
                  const status = PROJECT_STATUS_META[p.status];
                  return (
                    <tr
                      key={p.id}
                      onClick={() => navigate(`/projects/${p.id}`)}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/40"
                    >
                      <td className="px-4 py-3 font-medium">{p.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {p.githubRepo ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-12 text-center">
            <div className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
              <FolderGit2 className="size-5" />
            </div>
            <div>
              <p className="font-medium">No projects yet</p>
              <p className="text-sm text-muted-foreground">
                Meetings, todos, and the timeline all live on a project.
              </p>
            </div>
            <NewProjectDialog clientId={c.id} />
          </div>
        )}
      </div>
    </>
  );
}

function NewProjectDialog({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [githubRepo, setGithubRepo] = React.useState("");
  const [description, setDescription] = React.useState("");

  const create = useMutation({
    mutationFn: backend.projects.create,
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success(`${project.name} created`);
      setOpen(false);
      navigate(`/projects/${project.id}`);
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not create project",
      ),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({
      clientId,
      name,
      githubRepo: githubRepo || undefined,
      description: description || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          New project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            The repo is where approved tasks land as issues.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Website revamp"
              required
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-repo">GitHub repo</Label>
            <Input
              id="project-repo"
              value={githubRepo}
              onChange={(e) => setGithubRepo(e.target.value)}
              placeholder="owner/repo"
              pattern="[^/\s]+/[^/\s]+"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-description">Description</Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What are we building?"
              className="min-h-20"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? (
                <Spinner className="size-4" />
              ) : (
                <Plus className="size-4" />
              )}
              Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
