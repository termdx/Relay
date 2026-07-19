import { useQuery } from "@tanstack/react-query";
import { FileText, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { ClickableRow } from "@/components/clickable-row";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { backend } from "@/lib/api/backend";
import { formatDate } from "@/lib/format";
import { meetingStatusMeta } from "@/lib/status";

export function MeetingsPage() {
  const meetings = useQuery({
    queryKey: ["meetings"],
    queryFn: backend.meetings.list,
  });
  // Meetings only carry the client's email — resolve display names via clients.
  const clients = useQuery({
    queryKey: ["clients"],
    queryFn: backend.clients.list,
  });

  const clientName = (email: string) =>
    clients.data?.find((c) => c.email === email)?.name ?? email;

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
          <MeetingTableSkeleton />
        ) : meetings.isError ? (
          <ErrorState
            title="Couldn't load meetings"
            description="Is the backend running?"
            onRetry={() => meetings.refetch()}
          />
        ) : meetings.data && meetings.data.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Meeting</th>
                  <th className="px-4 py-2.5 font-medium">Client</th>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Tasks</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {meetings.data.map((m) => {
                  const status = meetingStatusMeta(m.status);
                  return (
                    <ClickableRow
                      key={m.id}
                      to={`/meetings/${m.id}`}
                      label={m.title}
                    >
                      <td className="px-4 py-3 font-medium">{m.title}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {clientName(m.clientEmail)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(m.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {m.tasks.length}
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
            icon={FileText}
            title="No meetings yet"
            description="Paste a transcript and Relay drafts the summary and tasks."
            action={
              <Button asChild>
                <Link to="/meetings/new">
                  <Plus className="size-4" />
                  New meeting
                </Link>
              </Button>
            }
          />
        )}
      </div>
    </>
  );
}

function MeetingTableSkeleton() {
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
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-8" />
          <Skeleton className="ml-auto h-5 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}
