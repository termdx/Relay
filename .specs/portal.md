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

Shipped (v1) — `apps/portal`, a Vite/React SPA on the Relay design system:

- **Sign-in**: email → single-use 15-minute magic link → 30-day portal
  session. Portal tokens are signed with a secret derived from JWT_SECRET, so
  they can never pass the owner guard (separation by signature). Request
  responses never reveal whether an email is a client.
- **Overview**: analytics (progress %, commits/PRs/issues 30d, 8-week
  activity chart), deliverables, decisions, client-safe activity feed
  (event-type allowlist).
- **Ask**: Relay AI chat grounded in the knowledge base, cited sources,
  "Powered by Relay AI" badge. Scoping enforced by project-ownership check +
  SQL WHERE.
- **Approvals**: pending "waiting on you" inbox linking to the approval
  pages, plus decision history.

- **Visibility controls**: what a client sees is the agency's call, per
  project — toggles for analytics, feed (with or without raw code events),
  deliverables, decisions, and the AI chat, set from the desktop project
  page. Enforced server-side in the portal API (disabled section → 404),
  never by UI hiding; the portal renders from the same resolved flags.
  Approvals are not togglable — they're the core loop.

- **Branding**: agency name, logo (inline data URI or https URL, ≤150 KB —
  no object storage needed), and accent color, edited on the desktop
  Branding page and served publicly at `GET /portal/branding` (the login
  page needs it pre-auth). The portal themes its primary color from the
  accent with computed contrast. The "Powered by Relay" badge stays.

Later: invited accounts, weekly digest opt-in.
