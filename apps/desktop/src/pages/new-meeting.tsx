import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Sparkles, Upload } from "lucide-react";
import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "@/lib/toast";
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

export function NewMeetingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [clientEmail, setClientEmail] = React.useState("");
  const [githubRepo, setGithubRepo] = React.useState("");
  const [transcript, setTranscript] = React.useState("");

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
    onSuccess: (meeting) => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Draft generated");
      navigate(`/meetings/${meeting.id}`);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not create meeting"),
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

  return (
    <>
      <PageHeader
        title="New meeting"
        description="Relay drafts a client-ready summary and proposed tasks from the transcript."
        actions={
          <Button variant="outline" asChild>
            <Link to="/meetings">
              <ArrowLeft className="size-4" />
              Back
            </Link>
          </Button>
        }
      />

      <form onSubmit={onSubmit} className="mx-auto max-w-2xl px-8 py-6">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Label>Project</Label>
            <Select value={projectId} onValueChange={onSelectProject}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    projects.data && projects.data.length === 0
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
            <p className="text-xs text-muted-foreground">
              Fills the project timeline and prefills client + repo.
            </p>
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
              placeholder="owner/repo"
              pattern="[^/\s]+/[^/\s]+"
              required
            />
            <p className="text-xs text-muted-foreground">
              Approved tasks are pushed here as issues.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="transcript">Transcript</Label>
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <Upload className="size-3.5" />
                Import file
                <input
                  type="file"
                  accept=".txt,.md,.vtt,.srt,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () =>
                      setTranscript(String(reader.result ?? ""));
                    reader.readAsText(file);
                  }}
                />
              </label>
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
    </>
  );
}
