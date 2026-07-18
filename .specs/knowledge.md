# Knowledge Engine

The source of truth. Every signal Relay tracks — meetings, commits, messages,
decisions, todos, deployments — is ingested into a per-project knowledge base
that can answer any question about the project lifecycle.

## Principles

- **Events in, knowledge out.** The engine subscribes to domain events; it is
  never written to directly by request handlers.
- **Provenance always.** Every chunk knows its client, project, source event,
  and timestamp. Answers cite sources.
- **Scoped retrieval.** A client on the portal can only ever retrieve chunks
  belonging to their own projects. Scoping happens in the query, not in the
  prompt.
- **The knowledge base is derived state.** It can always be rebuilt by
  replaying the timeline. Postgres rows are the record; knowledge is the index
  over them.

## Pipeline

```
domain event (MeetingApproved, IssueClosed, MessageReceived, …)
      │
      ▼
ingestion worker: normalize → chunk → embed (ai `embed` capability)
      │
      ▼
KnowledgeChunk rows (pgvector) with provenance
      │
      ▼
retrieval: filter by client/project → vector + keyword search → rank
      │
      ▼
grounded generation (ai `chat` capability) — Relay AI answers with citations
```

## Consumers

- **Client portal chat** — the flagship consumer (see `portal.md`).
- **Founder Q&A in desktop** — same engine, unscoped within the workspace.
- **Weekly digests / status drafts** — generated summaries sent through the
  approval loop before any client sees them.

## Status

Planned. Prerequisites in order: client/project entities, timeline events,
`embed` capability on an AI provider. pgvector is already enabled in Postgres.
