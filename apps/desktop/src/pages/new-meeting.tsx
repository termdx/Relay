import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Upload } from "lucide-react";
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/lib/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
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

const MAX_TRANSCRIPT_FILE = 2 * 1024 * 1024; // 2 MB of plain text is a LOT of meeting.

export function NewMeetingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInput = React.useRef<HTMLInputElement>(null);
  const [projectId, setProjectId] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [clientEmail, setClientEmail] = React.useState("");
  const [githubRepo, setGithubRepo] = React.useState("");
  const [transcript, setTranscript] = React.useState("");
  const [confirmLeave, setConfirmLeave] = React.useState(false);

  const started = Boolean(title || transcript || clientEmail || githubRepo);

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: backend.projects.list,
  });

  /** Attribute the meeting to a project and its client/repo come for free. */
  function onSelectProject(id: string) {
    setProjectId(id);
    const project = projects.data?.find((p) => p.id === id);
    if (project) {
      setClientEmail(project.client.email);
      if (project.githubRepo) setGithubRepo(project.githubRepo);
    }
  }

  const create = useMutation({
    mutationFn: backend.meetings.create,
    onMutate: () => {
      toast.loading("Generating draft — this can take a few seconds…", {
        id: "generate-draft",
      });
    },
    onSuccess: (meeting) => {
      toast.dismiss("generate-draft");
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Draft generated");
      navigate(`/meetings/${meeting.id}`);
    },
    onError: (err) => {
      toast.dismiss("generate-draft");
      toast.error(
        err instanceof ApiError ? err.message : "Could not create meeting",
      );
    },
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({
      projectId: projectId || undefined,
      title,
      clientEmail,
      githubRepo,
      transcript,
    });
  }

  function importTranscript(file: File) {
    if (file.size > MAX_TRANSCRIPT_FILE) {
      toast.error("That file is over 2 MB — paste the relevant part instead.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setTranscript(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  return (
    <>
      <PageHeader
        title="New meeting"
        description="Relay drafts a client-ready summary and proposed tasks from the transcript."
        breadcrumb={[
          {
            label: "Meetings",
            to: "/meetings",
            onClick: started ? () => setConfirmLeave(true) : undefined,
          },
          { label: "New meeting" },
        ]}
      />

      <form onSubmit={onSubmit} className="mx-auto max-w-2xl px-8 py-6">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project">Project</Label>
            <Select value={projectId} onValueChange={onSelectProject}>
              <SelectTrigger id="project">
                <SelectValue
                  placeholder={
                    projects.isLoading
                      ? "Loading projects…"
                      : projects.data && projects.data.length === 0
                        ? "No projects yet — meeting won’t appear on a timeline"
                        : "Attribute to a project (recommended)"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(projects.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.client.name} — {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {projects.isError ? (
              <p className="text-xs text-destructive">
                Couldn’t load projects —{" "}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-destructive/80"
                  onClick={() => projects.refetch()}
                >
                  retry
                </button>
                . You can still create the meeting unattributed.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Fills the project timeline and prefills client + repo.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Acme — Sprint kickoff"
                required
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="client">Client email</Label>
              <Input
                id="client"
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="client@acme.com"
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="repo">GitHub repo</Label>
            <Input
              id="repo"
              value={githubRepo}
              onChange={(e) => setGithubRepo(e.target.value)}
              placeholder="acme/website"
              pattern="[^/\s]+/[^/\s]+"
              aria-describedby="repo-hint"
              required
            />
            <p id="repo-hint" className="text-xs text-muted-foreground">
              Format: owner/repo. Approved tasks are pushed here as issues.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="transcript">Transcript</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto px-2 py-1 text-xs text-muted-foreground"
                onClick={() => fileInput.current?.click()}
              >
                <Upload className="size-3.5" />
                Import file
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept=".txt,.md,.vtt,.srt,text/plain"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) importTranscript(file);
                  e.target.value = "";
                }}
              />
            </div>
            <Textarea
              id="transcript"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Paste the meeting transcript…"
              className="min-h-64 font-mono text-xs leading-relaxed"
              required
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? (
                <Spinner className="size-4" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Generate draft
            </Button>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        title="Discard this meeting?"
        description="The title, transcript, and details you've entered will be lost."
        confirmLabel="Discard and leave"
        destructive
        onConfirm={() => navigate("/meetings")}
      />
    </>
  );
}
