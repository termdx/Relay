# Vision

Relay is the operating system for freelancers, agencies, and indie hackers who
build and ship software for clients.

## The problem

Client work is scattered. Code lives in GitHub/GitLab, conversations in Slack
and Discord, meetings on Google Calendar, decisions in email threads, todos in
someone's head. Nobody — not the builder, and certainly not the client — has
one place that knows the full state of a project. Answering "where are we?"
costs a meeting.

## What Relay is

Relay connects the tools people already use in their dev & ship workflow and
becomes the layer that watches everything flow through them:

1. **Connect** — integrations with the tools of the trade (GitHub, GitLab,
   Bitbucket, Slack, Discord, Google Calendar, email/SMTP, S3).
2. **Track** — every event, todo, decision, and progress marker is captured
   against a specific client and project, forming a living timeline.
3. **Know** — the knowledge engine ingests all of it into a per-project
   knowledge base: the **source of truth** for the entire project lifecycle.
4. **Share** — a client-facing portal, hostable at `relay.<company>.com`,
   where clients see status and ask the **Relay AI chatbot** anything about
   their project. The knowledge base grounds every answer.
5. **Approve** — AI drafts, humans decide. Work only lands in external tools
   (issues created, emails sent) after explicit human approval.

## What Relay is not

- Not another project-management tool competing with Jira or ClickUp.
- Not a chat app or a code host.
- It is the **orchestration and knowledge layer over** those tools.

## The core loop

```
signal (meeting, commit, message, calendar event)
      │  via integrations
      ▼
tracked event on a client's project timeline
      │
      ▼
knowledge engine ingests → source of truth
      │
      ├──▶ AI drafts next actions → human approves → pushed to tools
      └──▶ client portal + Relay AI answers from the knowledge base
```

Every feature in Relay must strengthen this loop.
