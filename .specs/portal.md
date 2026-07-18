# Client Portal

The client-facing surface, hostable at `relay.<company>.com`. Where the
agency's clients see project status and ask questions — without meetings.

## What a client sees

- **Status** — live project overview derived from the timeline: recent
  activity, open todos, upcoming milestones, latest decisions.
- **Relay AI chat** — a chatbot that answers questions about the client's
  project ("what shipped this week?", "why was X decided?", "when is the demo?")
  grounded exclusively in the knowledge base, with citations.
- **Approvals** — pending approval requests (drafts, plans, summaries) with
  approve / request-changes actions. The existing magic-link approval page is
  the seed of this surface.

## Boundaries

- Clients authenticate with scoped credentials (magic link or invited
  account). A client sees **only their own projects** — enforced at the query
  layer, never by prompt instructions.
- The chatbot answers from retrieved knowledge only. No knowledge → it says
  so; it never speculates about project state.
- Nothing appears on the portal that hasn't passed the approval loop:
  publishing to the portal is an explicit act, not a default.
- The portal is read + approve; it is not a PM tool for clients to create
  work in.

## Architecture

A separate web app (server-rendered or SPA) speaking to the backend's scoped
portal API. Deployed alongside the backend on the agency's own infrastructure;
`relay.<company>.com` is a DNS + reverse-proxy concern, per-agency branding
(logo, colors) comes from workspace config.

## Status

Planned. Prerequisites: client/project entities, knowledge engine, `chat`
capability. The approval page (backend-rendered magic-link) exists today and
will be absorbed into the portal.
