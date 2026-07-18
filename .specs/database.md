# Database

## PostgreSQL (+ pgvector)

The system of record and the substrate of the knowledge engine. One database;
each backend module owns its tables (schemas composed in a Drizzle barrel).

Core entities:

| Entity | Notes | Status |
|---|---|---|
| User | Workspace owner + team members | shipped (owner) |
| Client | The anchor: everything hangs off a client | next |
| Project | Belongs to a client; links repos, channels, calendars | next |
| TimelineEvent | Append-only; every tracked signal lands here | next |
| Todo | Extracted or manual; per project; may map to external issues | shipped |
| Decision | First-class record: what was decided, when, by whom, source | shipped |
| Meeting / MeetingTask | Transcript, draft, tasks | shipped |
| Approval | Frozen snapshot + token + decision | shipped |
| KnowledgeChunk | Embedded content (pgvector) with source provenance | planned |
| Attachment | Object-storage reference (S3 key, mime, size) | planned |
| Notification | Outbound message log | planned |

Rules:

- pgvector lives in the same Postgres — no separate vector database.
- Every knowledge chunk carries provenance (client, project, source event) so
  retrieval can be scoped and answers can cite sources.
- Timeline events are immutable; corrections are new events.

## Object Storage — Amazon S3

Images, attachments, recordings, contracts, screenshots. S3 in production;
MinIO (S3-compatible) for self-hosted/local via the runtime's compose
generation. The database stores keys and metadata, never blobs.

## Redis (planned)

Cache, rate limiting, transient state. Introduced only when a concrete need
lands (not speculatively).

## SQLite

Not used server-side. The desktop may cache locally, but it is never the
system of record.
