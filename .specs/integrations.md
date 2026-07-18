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
| GitLab | both | same as GitHub | planned |
| Bitbucket | both | same as GitHub | planned |
| Slack | both | notifications out; messages/decisions in | catalog entry only |
| Discord | both | same as Slack | planned |
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
