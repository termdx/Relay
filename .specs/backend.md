# Backend

NestJS modular monolith. System of record. Thin API, domain-driven modules,
event-driven communication between them.

## Modules

| Module | Purpose | Status |
|---|---|---|
| auth | Owner setup, login, JWT guard | shipped |
| client | Client records — the anchor entity for everything | next |
| project | Projects under a client; members, repos, links | next |
| timeline | Append-only event feed per project | next |
| meeting | Transcript → AI draft → approval → tasks | shipped |
| approval | Snapshot + magic-link decisions (generalizes beyond meetings) | shipped |
| todo | Project todos — manual or synced from approved meetings | shipped |
| decision | First-class decision records (what/who/when/source) | shipped |
| knowledge | Ingestion + retrieval over pgvector; the source of truth | planned |
| notification | Outbound email via Mailer port (SMTP/stub); Slack/Discord later | email shipped |
| storage | File/image uploads to S3-compatible object storage | planned |
| outbox | Transactional outbox: durable, retried external side effects | shipped |
| integration/* | One adapter module per external tool, behind ports | github shipped |
| ai | Capability ports (draft, chat, embed) + provider adapters | draft shipped |

## Rules

- Controllers hold no business logic; services own their domain.
- Every module owns its own Drizzle schema file; `database/schema.ts` is a
  barrel that composes them.
- Modules communicate through domain events, not direct imports of each
  other's services; integration adapters are invoked behind DI ports.
- No long-running AI work inside request handlers — draft generation is the
  current tolerated exception until the orchestration layer lands.
- Everything client-visible passes through the approval module before any
  external side effect fires.

## API responsibilities

Authentication, CRUD, validation, file uploads, webhook receivers (per
integration), starting workflows, and serving the client portal's scoped API.
