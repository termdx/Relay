import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Users } from "lucide-react";
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/lib/toast";
import { ClickableRow } from "@/components/clickable-row";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
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

export function ClientsPage() {
  const clients = useQuery({
    queryKey: ["clients"],
    queryFn: backend.clients.list,
  });

  return (
    <>
      <PageHeader
        title="Clients"
        description="Everything Relay tracks hangs off a client."
        actions={<NewClientDialog />}
      />

      <div className="px-8 py-6">
        {clients.isLoading ? (
          <ClientTableSkeleton />
        ) : clients.isError ? (
          <ErrorState
            title="Couldn't load clients"
            description="Is the backend running?"
            onRetry={() => clients.refetch()}
          />
        ) : clients.data && clients.data.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Client</th>
                  <th className="px-4 py-2.5 font-medium">Company</th>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 font-medium">Projects</th>
                </tr>
              </thead>
              <tbody>
                {clients.data.map((c) => (
                  <ClickableRow
                    key={c.id}
                    to={`/clients/${c.id}`}
                    label={c.name}
                  >
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.company ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.email}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.projects.length}
                    </td>
                  </ClickableRow>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title="No clients yet"
            description="Add your first client — projects, meetings, and the timeline all attach to one."
            action={<NewClientDialog />}
          />
        )}
      </div>
    </>
  );
}

function ClientTableSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-lg border border-border"
    >
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-border px-4 py-3.5 last:border-0"
        >
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="ml-auto h-4 w-6" />
        </div>
      ))}
    </div>
  );
}

function NewClientDialog() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [notes, setNotes] = React.useState("");

  // Fresh form every time the dialog opens.
  React.useEffect(() => {
    if (open) {
      setName("");
      setCompany("");
      setEmail("");
      setNotes("");
    }
  }, [open]);

  const create = useMutation({
    mutationFn: backend.clients.create,
    onSuccess: (client) => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success(`${client.name} added`);
      setOpen(false);
      navigate(`/clients/${client.id}`);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not add client"),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({
      name,
      email,
      company: company || undefined,
      notes: notes || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          New client
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New client</DialogTitle>
          <DialogDescription>
            The email doubles as their portal identity and approval-link
            recipient.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="client-name">Name</Label>
              <Input
                id="client-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jamie Rivera"
                required
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="client-company">Company</Label>
              <Input
                id="client-company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Acme Inc."
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="client-email">Email</Label>
            <Input
              id="client-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jamie@acme.com"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="client-notes">Notes</Label>
            <Textarea
              id="client-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Context worth remembering…"
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
              Add client
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
