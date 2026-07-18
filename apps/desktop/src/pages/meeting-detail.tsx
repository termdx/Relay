import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Plus,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "@/lib/toast";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { openExternal } from "@/lib/open";
import { backend } from "@/lib/api/backend";
import { ApiError } from "@/lib/api/http";
import type { Meeting } from "@/lib/api/types";
import { isEditable, meetingStatusMeta } from "@/lib/status";

interface DraftTask {
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
      <div className="flex justify-center py-20 text-muted-foreground">
        <Spinner className="size-5" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return <p className="px-8 py-6 text-sm text-destructive">Meeting not found.</p>;
  }

  return (
    <MeetingReview
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
  const editable = isEditable(meeting.status);
  const status = meetingStatusMeta(meeting.status);

  const [summary, setSummary] = React.useState(meeting.summary ?? "");
  const [tasks, setTasks] = React.useState<DraftTask[]>(
    meeting.tasks.map((t) => ({
      title: t.title,
      body: t.body,
      assignee: t.assignee ?? "",
    })),
  );
  const [approvalUrl, setApprovalUrl] = React.useState<string | null>(null);

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
    onSuccess: (res) => {
      setApprovalUrl(res.approvalUrl);
      toast.success("Approval link ready");
      onChanged();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Send failed"),
  });

  function updateTask(i: number, patch: Partial<DraftTask>) {
    setTasks((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }

  return (
    <>
      <PageHeader
        title={meeting.title}
        description={`Client: ${meeting.clientEmail} · ${meeting.githubRepo}`}
        actions={
          <>
            <Badge variant={status.variant}>{status.label}</Badge>
            <Button variant="outline" asChild>
              <Link to="/meetings">
                <ArrowLeft className="size-4" />
                Back
              </Link>
            </Button>
          </>
        }
      />

      <div className="mx-auto max-w-3xl space-y-6 px-8 py-6">
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
        {(approvalUrl || meeting.status === "PENDING_APPROVAL") && (
          <ApprovalLink url={approvalUrl} />
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
                  setTasks((p) => [...p, { title: "", body: "", assignee: "" }])
                }
              >
                <Plus className="size-4" />
                Add task
              </Button>
            )}
          </div>

          {tasks.length === 0 && (
            <p className="text-sm text-muted-foreground">No tasks.</p>
          )}

          <div className="space-y-3">
            {tasks.map((task, i) => (
              <div
                key={i}
                className="space-y-2 rounded-lg border border-border bg-card p-3"
              >
                <div className="flex items-center gap-2">
                  <Input
                    value={task.title}
                    onChange={(e) => updateTask(i, { title: e.target.value })}
                    placeholder="Task title"
                    disabled={!editable}
                    className="font-medium"
                  />
                  {editable && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setTasks((p) => p.filter((_, idx) => idx !== i))
                      }
                      aria-label="Remove task"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
                <Textarea
                  value={task.body}
                  onChange={(e) => updateTask(i, { body: e.target.value })}
                  placeholder="Details"
                  disabled={!editable}
                  className="min-h-0 h-16 text-sm"
                />
                <div className="flex items-center gap-2">
                  <Input
                    value={task.assignee}
                    onChange={(e) => updateTask(i, { assignee: e.target.value })}
                    placeholder="Owner (optional)"
                    disabled={!editable}
                    className="h-8 max-w-48 text-xs"
                  />
                  {meeting.tasks[i]?.githubIssueUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        void openExternal(meeting.tasks[i]!.githubIssueUrl!)
                      }
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="size-3" />
                      issue
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {editable && (
          <div className="flex justify-end gap-2 border-t border-border pt-5">
            <Button
              variant="outline"
              onClick={() => save.mutate()}
              disabled={save.isPending}
            >
              {save.isPending ? <Spinner className="size-4" /> : <Save className="size-4" />}
              Save draft
            </Button>
            <Button onClick={() => send.mutate()} disabled={send.isPending}>
              {send.isPending ? <Spinner className="size-4" /> : <Send className="size-4" />}
              Send for approval
            </Button>
          </div>
        )}

        <TranscriptDisclosure transcript={meeting.transcript} />
      </div>
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
  const border =
    tone === "success" ? "border-l-[--color-success]" : "border-l-destructive";
  return (
    <div className={`rounded-md border border-border border-l-4 ${border} bg-card p-4`}>
      <div className="text-sm font-medium">{label}</div>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

function ApprovalLink({ url }: { url: string | null }) {
  const [copied, setCopied] = React.useState(false);
  if (!url) {
    return (
      <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
        Waiting on the client to open the approval link.
      </div>
    );
  }
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="text-sm font-medium">Send this link to your client</div>
      <div className="mt-2 flex items-center gap-2">
        <Input readOnly value={url} className="font-mono text-xs" />
        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            navigator.clipboard.writeText(url);
            setCopied(true);
            toast.success("Copied");
            setTimeout(() => setCopied(false), 1500);
          }}
          aria-label="Copy link"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        No account needed — the link is the client’s credential.
      </p>
    </div>
  );
}

function TranscriptDisclosure({ transcript }: { transcript: string }) {
  return (
    <details className="rounded-lg border border-border bg-card">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
        Transcript
      </summary>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap border-t border-border px-4 py-3 font-mono text-xs text-muted-foreground">
        {transcript}
      </pre>
    </details>
  );
}
