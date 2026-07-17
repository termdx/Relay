import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Sparkles } from "lucide-react";
import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { backend } from "@/lib/api/backend";
import { ApiError } from "@/lib/api/http";

export function NewMeetingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = React.useState("");
  const [clientEmail, setClientEmail] = React.useState("");
  const [githubRepo, setGithubRepo] = React.useState("");
  const [transcript, setTranscript] = React.useState("");

  const create = useMutation({
    mutationFn: backend.meetings.create,
    onSuccess: (meeting) => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      toast.success("Draft generated");
      navigate(`/meetings/${meeting.id}`);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not create meeting"),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({ title, clientEmail, githubRepo, transcript });
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
            <Label htmlFor="transcript">Transcript</Label>
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
