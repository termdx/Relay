import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderGit2, Link2, Plus } from "lucide-react";
import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "@/lib/toast";
import { ClickableRow } from "@/components/clickable-row";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { backend } from "@/lib/api/backend";
import { ApiError } from "@/lib/api/http";
import { projectStatusMeta } from "@/lib/status";

export function ClientDetailPage() {
  const { id = "" } = useParams();
  const client = useQuery({
    queryKey: ["clients", id],
    queryFn: () => backend.clients.get(id),
    enabled: Boolean(id),
  });

  if (client.isLoading) {
    return (
      <>
        <PageHeader
          title="Client"
          breadcrumb={[
            { label: "Clients", to: "/clients" },
            { label: "…" },
          ]}
        />
        <div className="px-8 py-6" aria-hidden="true">
          <Skeleton className="mb-6 h-4 w-96" />
          <Skeleton className="mb-3 h-3 w-24" />
          <div className="overflow-hidden rounded-lg border border-border">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="flex items-center gap-4 border-b border-border px-4 py-3.5 last:border-0"
              >
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="ml-auto h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  if (client.isError || !client.data) {
    return (
      <>
        <PageHeader
          title="Client"
          breadcrumb={[
            { label: "Clients", to: "/clients" },
            { label: "Not found" },
          ]}
        />
        <div className="px-8 py-6">
          <ErrorState
            title="Couldn't load this client"
            description="It may have been deleted, or the backend is unreachable."
            onRetry={() => client.refetch()}
          />
        </div>
      </>
    );
  }

  const c = client.data;
  return (
    <>
      <PageHeader
        title={c.name}
        description={[c.company, c.email].filter(Boolean).join(" · ")}
        breadcrumb={[
          { label: "Clients", to: "/clients" },
          { label: c.name },
        ]}
        actions={<NewProjectDialog clientId={c.id} />}
      />

      <div className="px-8 py-6">
        {c.notes ? (
          <p className="mb-6 max-w-2xl whitespace-pre-wrap text-sm text-muted-foreground">
            {c.notes}
          </p>
        ) : null}

        <PortalAccessCard clientId={c.id} clientName={c.name} />

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
                  const status = projectStatusMeta(p.status);
                  return (
                    <ClickableRow
                      key={p.id}
                      to={`/projects/${p.id}`}
                      label={p.name}
                    >
                      <td className="px-4 py-3 font-medium">{p.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {p.githubRepo ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </td>
                    </ClickableRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={FolderGit2}
            title="No projects yet"
            description="Meetings, todos, and the timeline all live on a project."
            action={<NewProjectDialog clientId={c.id} />}
          />
        )}
      </div>
    </>
  );
}

/**
 * Portal access without email: mints a single-use sign-in link (15 min) the
 * founder can paste into whatever channel the client is on.
 */
function PortalAccessCard({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const link = useMutation({
    mutationFn: () => backend.clients.portalLink(clientId),
    onSuccess: async ({ url }) => {
      await navigator.clipboard.writeText(url);
      toast.success("Sign-in link copied — valid 15 minutes, single use");
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not create sign-in link",
      ),
  });

  return (
    <div className="mb-6 flex max-w-2xl items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
      <div>
        <p className="text-sm font-medium">Client portal</p>
        <p className="text-sm text-muted-foreground">
          Send {clientName} a sign-in link — they see progress and approvals,
          and can ask Relay AI.
        </p>
      </div>
      <Button
        variant="outline"
        className="shrink-0"
        onClick={() => link.mutate()}
        disabled={link.isPending}
      >
        {link.isPending ? (
          <Spinner className="size-4" />
        ) : (
          <Link2 className="size-4" />
        )}
        Copy sign-in link
      </Button>
    </div>
  );
}

function NewProjectDialog({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [githubRepo, setGithubRepo] = React.useState("");
  const [description, setDescription] = React.useState("");

  // Fresh form every time the dialog opens.
  React.useEffect(() => {
    if (open) {
      setName("");
      setGithubRepo("");
      setDescription("");
    }
  }, [open]);

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
              placeholder="acme/website"
              pattern="[^/\s]+/[^/\s]+"
              aria-describedby="project-repo-hint"
            />
            <p id="project-repo-hint" className="text-xs text-muted-foreground">
              Format: owner/repo — e.g. acme/website.
            </p>
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
