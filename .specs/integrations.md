# Integrations

Integrations connect Relay to the tools people already use. Each one is:

1. a **catalog entry** in the runtime (credentials as secret refs, webhooks,
   health checks) — installable via `relay integration add <id>` or desktop, and
2. a **backend adapter module** implementing a stable port, injected via DI.

Callers depend on ports, never on vendors. Credentials live in the runtime's
encrypted secret store; manifests and code never contain values.

## Ports

| Port | Implemented by | Consumers |
|---|---|---|
| IssueTrackerPort | GitHub, GitLab, Bitbucket | meeting/todo publishing |
| NotifierPort | Slack, Discord | notification module |
| MailerPort | SMTP | approval links, digests, invites |
| CalendarPort | Google Calendar | meeting ingestion, milestones |
| ObjectStoragePort | Amazon S3 (MinIO locally) | storage module |
| WebhookSource | GitHub, GitLab, Bitbucket, Slack, Discord, GCal | timeline ingestion |

## Supported set (target)

| Integration | Direction | Purpose | Status |
|---|---|---|---|
| GitHub | both | issues out; commits/PRs/issues in (webhooks) | shipped both directions — issue close auto-completes the mirrored todo |
| GitLab | both | issues out ("gitlab:group/proj"); push/MR/issue webhooks in; issue close completes todos | shipped |
| Bitbucket | both | issues out ("bitbucket:ws/repo"); push/PR webhooks in | shipped |
| Slack | out | incoming-webhook notifications (approvals, decisions, merges) via outbox | shipped (messages-in later) |
| Discord | out | same as Slack | shipped |
| Google Calendar | both | milestones out; meetings in | planned |
| SMTP | out | approval links, weekly digests, portal invites | adapter shipped (nodemailer, SMTP_URL-selected) |
| Amazon S3 | out | images, attachments, recordings | planned |

## Connecting

- **OAuth device flow first** (GitHub today; GitLab/Bitbucket/Google follow
  the same pattern): "Sign in with GitHub" → short code → github.com → done.
  Device flow needs only a public client id — no secret, no redirect server —
  so it works self-hosted. The runtime performs both legs; the token goes
  straight into the encrypted secret store and never round-trips through the
  UI. The OAuth app client id is remembered per workspace
  (RELAY_GITHUB_CLIENT_ID as deploy-wide default).
- **Token paste stays as the fallback** (CI, fine-grained PATs, air-gapped).

## Transcript ingest

Meetings enter without pasting: each project has an ingest URL
(`POST /webhooks/transcript/:projectId?token=<INGEST_SECRET>`, body
`{title?, transcript}`) — anything that can POST JSON (Fireflies, Fathom,
Zapier, n8n, a shortcut) turns a call into a drafted meeting. The secret is
workspace-generated (never user-supplied), the response is an immediate 202,
and drafting runs durably on the outbox; client email + repo derive from the
project. Copyable per-project URL on the desktop project page; the meeting
form also imports transcript files directly.

## Rules

- **Inbound**: webhook receivers normalize vendor payloads into domain events
  (`timeline` ingests them). Vendor payloads never leak past the adapter.
- **Outbound**: every external write goes through the transactional outbox
  (durable, retried, idempotent) — never fired directly from an event handler.
  Shipped; Temporal subsumes it later (see `temporal.md`).
- **Client-visible side effects** (issue created, email sent) require a prior
  approval record.
- Adapters ship with a stub implementation for dev/test; provider selection is
  config, not code.
