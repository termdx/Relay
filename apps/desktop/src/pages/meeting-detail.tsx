import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Plus,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "@/lib/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { openExternal } from "@/lib/open";
import { backend } from "@/lib/api/backend";
import { ApiError } from "@/lib/api/http";
import type { Meeting } from "@/lib/api/types";
import { isEditable, meetingStatusMeta } from "@/lib/status";
import { cn } from "@/lib/utils";

interface DraftTask {
  /** Local-only identity for stable React keys while editing. */
  key: string;
  title: string;
  body: string;
  assignee: string;
}

export function MeetingDetailPage() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["meetings", id],
    queryFn: () => backend.meetings.get(id),
  });

  if (query.isLoading) {
    return (
      <>
        <PageHeader
          title="Meeting"
          breadcrumb={[{ label: "Meetings", to: "/meetings" }, { label: "…" }]}
        />
        <div className="mx-auto max-w-2xl space-y-6 px-8 py-6" aria-hidden="true">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </>
    );
  }
  if (query.isError || !query.data) {
    return (
      <>
        <PageHeader
          title="Meeting"
          breadcrumb={[
            { label: "Meetings", to: "/meetings" },
            { label: "Not found" },
          ]}
        />
        <div className="px-8 py-6">
          <ErrorState
            title="Couldn't load this meeting"
            description="It may have been deleted, or the backend is unreachable."
            onRetry={() => query.refetch()}
          />
        </div>
      </>
    );
  }

  return (
    <MeetingReview
      // Remount when the server copy changes so the form never shows stale data.
      key={query.data.updatedAt}
      meeting={query.data}
      onChanged={() => {
        queryClient.invalidateQueries({ queryKey: ["meetings", id] });
        queryClient.invalidateQueries({ queryKey: ["meetings"] });
      }}
    />
  );
}

function MeetingReview({
  meeting,
  onChanged,
}: {
  meeting: Meeting;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const editable = isEditable(meeting.status);
  const status = meetingStatusMeta(meeting.status);

  const [summary, setSummary] = React.useState(meeting.summary ?? "");
  const [tasks, setTasks] = React.useState<DraftTask[]>(
    meeting.tasks.map((t) => ({
      key: t.id,
      title: t.title,
      body: t.body,
      assignee: t.assignee ?? "",
    })),
  );
  const [confirmSend, setConfirmSend] = React.useState(false);
  const [confirmLeave, setConfirmLeave] = React.useState(false);
  const [taskToRemove, setTaskToRemove] = React.useState<string | null>(null);

  // Must mirror draftPayload() exactly (JSON.stringify drops undefined
  // fields) or the dirty check false-positives on untouched forms.
  const initialPayload = React.useMemo(
    () =>
      JSON.stringify({
        summary: meeting.summary ?? "",
        tasks: meeting.tasks.map((t) => ({
          title: t.title,
          body: t.body,
          assignee: t.assignee || undefined,
        })),
      }),
    [meeting],
  );

  function draftPayload() {
    return {
      summary,
      tasks: tasks.map((t) => ({
        title: t.title,
        body: t.body,
        assignee: t.assignee || undefined,
      })),
    };
  }

  const dirty = JSON.stringify(draftPayload()) !== initialPayload;

  const save = useMutation({
    mutationFn: () => backend.meetings.updateDraft(meeting.id, draftPayload()),
    onSuccess: () => {
      toast.success("Draft saved");
      onChanged();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Save failed"),
  });

  const send = useMutation({
    // Persist edits FIRST so the approval snapshot reflects what's on screen —
    // once sent the meeting locks and updateDraft would be rejected.
    mutationFn: async () => {
      await backend.meetings.updateDraft(meeting.id, draftPayload());
      return backend.meetings.sendForApproval(meeting.id);
    },
    onSuccess: () => {
      toast.success(`Approval link sent to ${meeting.clientEmail}`);
      onChanged();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Send failed"),
  });

  function updateTask(key: string, patch: Partial<DraftTask>) {
    setTasks((prev) =>
      prev.map((t) => (t.key === key ? { ...t, ...patch } : t)),
    );
  }

  function requestRemoveTask(task: DraftTask) {
    // Removing an untouched empty row needs no ceremony.
    if (!task.title && !task.body) {
      setTasks((p) => p.filter((t) => t.key !== task.key));
    } else {
      setTaskToRemove(task.key);
    }
  }

  return (
    <>
      <PageHeader
        title={meeting.title}
        description={`Client: ${meeting.clientEmail} · ${meeting.githubRepo}`}
        breadcrumb={[
          {
            label: "Meetings",
            to: "/meetings",
            onClick: dirty ? () => setConfirmLeave(true) : undefined,
          },
          { label: meeting.title },
        ]}
        actions={
          <>
            {dirty && editable && (
              <span className="text-xs text-muted-foreground">
                Unsaved changes
              </span>
            )}
            <Badge variant={status.variant}>{status.label}</Badge>
          </>
        }
      />

      <div className="mx-auto max-w-2xl space-y-6 px-8 py-6">
        {meeting.status === "CHANGES_REQUESTED" && meeting.clientComment && (
          <Callout tone="destructive" label="Client requested changes">
            {meeting.clientComment}
          </Callout>
        )}
        {meeting.status === "APPROVED" && (
          <Callout tone="success" label="Approved by the client">
            {meeting.clientComment || "The client approved this update."}
          </Callout>
        )}
        {meeting.status === "PENDING_APPROVAL" && (
          <ApprovalLink meetingId={meeting.id} />
        )}

        <section className="space-y-2">
          <Label htmlFor="summary">Client-ready summary</Label>
          <Textarea
            id="summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            disabled={!editable}
            className="min-h-28"
          />
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Proposed tasks</Label>
            {editable && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setTasks((p) => [
                    ...p,
                    {
                      key: crypto.randomUUID(),
                      title: "",
                      body: "",
                      assignee: "",
                    },
                  ])
                }
              >
                <Plus className="size-4" />
                Add task
              </Button>
            )}
          </div>

          {tasks.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No tasks proposed — add one manually if something's missing.
            </p>
          )}

          <div className="space-y-3">
            {tasks.map((task, i) => {
              // Match the saved task for the issue link without relying on
              // row position (rows can be added/removed while editing).
              const saved = editable
                ? meeting.tasks.find((t) => t.title === task.title)
                : meeting.tasks[i];
              return (
                <div
                  key={task.key}
                  className="space-y-2 rounded-lg border border-border bg-card p-3"
                >
                  <div className="flex items-center gap-2">
                    <Input
                      value={task.title}
                      onChange={(e) => updateTask(task.key, { title: e.target.value })}
                      placeholder="Task title"
                      disabled={!editable}
                      className="font-medium"
                      aria-label={`Task ${i + 1} title`}
                    />
                    {editable && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => requestRemoveTask(task)}
                        aria-label="Remove task"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                  <Textarea
                    value={task.body}
                    onChange={(e) => updateTask(task.key, { body: e.target.value })}
                    placeholder="Details"
                    disabled={!editable}
                    className="min-h-0 h-16 text-sm"
                    aria-label={`Task ${i + 1} details`}
                  />
                  <div className="flex items-center gap-2">
                    <Input
                      value={task.assignee}
                      onChange={(e) =>
                        updateTask(task.key, { assignee: e.target.value })
                      }
                      placeholder="Owner (optional)"
                      disabled={!editable}
                      className="h-8 max-w-48 text-xs"
                      aria-label={`Task ${i + 1} owner`}
                    />
                    {saved?.githubIssueUrl && (
                      <button
                        type="button"
                        onClick={() => void openExternal(saved.githubIssueUrl!)}
                        className="inline-flex items-center gap-1 rounded-sm text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <ExternalLink className="size-3" />
                        issue
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {editable && (
          <div className="flex justify-end gap-2 border-t border-border pt-5">
            <Button
              variant="outline"
              onClick={() => save.mutate()}
              disabled={save.isPending || send.isPending || !dirty}
            >
              {save.isPending ? <Spinner className="size-4" /> : <Save className="size-4" />}
              Save draft
            </Button>
            <Button
              onClick={() => setConfirmSend(true)}
              disabled={send.isPending || save.isPending}
            >
              {send.isPending ? <Spinner className="size-4" /> : <Send className="size-4" />}
              Send for approval
            </Button>
          </div>
        )}

        <TranscriptDisclosure transcript={meeting.transcript} />
      </div>

      <ConfirmDialog
        open={confirmSend}
        onOpenChange={setConfirmSend}
        title="Send for approval?"
        description={`The draft is saved and locked, and ${meeting.clientEmail} receives the approval link by email.`}
        confirmLabel="Send to client"
        onConfirm={() => send.mutate()}
      />
      <ConfirmDialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        title="Discard unsaved changes?"
        description="Your edits to the summary and tasks haven't been saved."
        confirmLabel="Discard and leave"
        destructive
        onConfirm={() => navigate("/meetings")}
      />
      <ConfirmDialog
        open={taskToRemove !== null}
        onOpenChange={(open) => !open && setTaskToRemove(null)}
        title="Remove this task?"
        description="It disappears from the draft when you save."
        confirmLabel="Remove task"
        destructive
        onConfirm={() => {
          setTasks((p) => p.filter((t) => t.key !== taskToRemove));
          setTaskToRemove(null);
        }}
      />
    </>
  );
}

function Callout({
  tone,
  label,
  children,
}: {
  tone: "success" | "destructive";
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-border border-l-4 bg-card p-4",
        tone === "success" ? "border-l-success" : "border-l-destructive",
      )}
    >
      <div className="text-sm font-medium">{label}</div>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

/** The live magic link for a pending meeting — fetched from the backend so
 * it survives navigating away and back. */
function ApprovalLink({ meetingId }: { meetingId: string }) {
  const [copied, setCopied] = React.useState(false);
  const link = useQuery({
    queryKey: ["meetings", meetingId, "approval-link"],
    queryFn: () => backend.meetings.approvalLink(meetingId),
    staleTime: 60_000,
  });
  const url = link.data?.approvalUrl ?? null;

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="text-sm font-medium">
        Waiting on the client to review
      </div>
      {link.isLoading ? (
        <Skeleton className="mt-2 h-9 w-full" />
      ) : url ? (
        <>
          <div className="mt-2 flex items-center gap-2">
            <Input
              readOnly
              value={url}
              className="font-mono text-xs"
              aria-label="Approval link"
              onFocus={(e) => e.target.select()}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              aria-label="Copy link"
            >
              {copied ? (
                <Check className="size-4 text-success" />
              ) : (
                <Copy className="size-4" />
              )}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            The link was emailed to the client — copy it here to share it
            another way. No account needed; the link is their credential.
          </p>
        </>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          The approval link was emailed to the client.
        </p>
      )}
    </div>
  );
}

function TranscriptDisclosure({ transcript }: { transcript: string }) {
  return (
    <details className="group rounded-lg border border-border bg-card">
      <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
        Transcript
      </summary>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap border-t border-border px-4 py-3 font-mono text-xs text-muted-foreground">
        {transcript}
      </pre>
    </details>
  );
}
