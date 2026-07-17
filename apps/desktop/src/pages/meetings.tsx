import { useQuery } from "@tanstack/react-query";
import { FileText, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { backend } from "@/lib/api/backend";
import { meetingStatusMeta } from "@/lib/status";

export function MeetingsPage() {
  const navigate = useNavigate();
  const meetings = useQuery({
    queryKey: ["meetings"],
    queryFn: backend.meetings.list,
  });

  return (
    <>
      <PageHeader
        title="Meetings"
        description="Turn a client conversation into an approved, actionable update."
        actions={
          <Button asChild>
            <Link to="/meetings/new">
              <Plus className="size-4" />
              New meeting
            </Link>
          </Button>
        }
      />

      <div className="px-8 py-6">
        {meetings.isLoading ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Spinner className="size-5" />
          </div>
        ) : meetings.isError ? (
          <p className="text-sm text-destructive">
            Couldn’t load meetings. Is the backend running?
          </p>
        ) : meetings.data && meetings.data.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Meeting</th>
                  <th className="px-4 py-2.5 font-medium">Client</th>
                  <th className="px-4 py-2.5 font-medium">Tasks</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {meetings.data.map((m) => {
                  const status = meetingStatusMeta(m.status);
                  return (
                    <tr
                      key={m.id}
                      onClick={() => navigate(`/meetings/${m.id}`)}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/40"
                    >
                      <td className="px-4 py-3 font-medium">{m.title}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {m.clientEmail}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {m.tasks.length}
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
          <EmptyState />
        )}
      </div>
    </>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
      <div className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
        <FileText className="size-5" />
      </div>
      <div>
        <p className="font-medium">No meetings yet</p>
        <p className="text-sm text-muted-foreground">
          Paste a transcript and Relay drafts the summary and tasks.
        </p>
      </div>
      <Button asChild className="mt-1">
        <Link to="/meetings/new">
          <Plus className="size-4" />
          New meeting
        </Link>
      </Button>
    </div>
  );
}
