# Architecture

## Philosophy

Relay is composed of four systems:

- **System of Record** — backend API + PostgreSQL. Owns business entities.
- **System of Knowledge** — the knowledge engine (pgvector + retrieval).
  The source of truth for project lifecycle context; grounds all AI answers.
- **System of Orchestration** — durable workflows (Temporal, planned;
  transactional outbox as the interim). Owns retries and long-running work.
- **System of Intelligence** — AI provider registry + capability ports
  (draft, chat, embed). AI never writes business data directly.

The desktop is the control plane. The backend is the system of record. The
knowledge base is the source of truth the client portal speaks from.

## Layers

```
┌────────────────────────┐   ┌─────────────────────────────┐
│  Desktop (Tauri)       │   │  Client Portal (web)        │
│  founder control plane │   │  relay.<company>.com        │
└──────────┬─────────────┘   │  status + Relay AI chat     │
           │ REST            └──────────────┬──────────────┘
           │                                │ REST (scoped)
┌──────────▼────────────────────────────────▼──────────────┐
│  Backend — NestJS modular monolith (system of record)    │
│  auth · client · project · timeline · meeting            │
│  knowledge · notification · integration adapters · ai    │
├──────────────────────────────────────────────────────────┤
│  PostgreSQL (+pgvector)   S3/MinIO   [Redis, planned]    │
└──────────────────────────────────────────────────────────┘
           ▲ webhooks / APIs                ▲
┌──────────┴──────────────┐      ┌──────────┴──────────────┐
│  External tools          │      │  Runtime (kernel)       │
│  GitHub · GitLab ·       │      │  workspace manifests,   │
│  Bitbucket · Slack ·     │      │  secrets, compose       │
│  Discord · GCal · SMTP   │      │  generation, lifecycle  │
└──────────────────────────┘      └─────────────────────────┘
```

## The Runtime

Relay self-hosts. The runtime (`packages/runtime-core`, daemon in
`services/runtime`, CLI in `apps/cli`) is the local kernel that materializes a
workspace: modules, integrations, and AI providers are **declarative YAML
manifests**; the runtime resolves dependencies, stores credentials encrypted,
generates `docker-compose.yml` + `.env`, and drives the stack. The desktop
bundles the daemon as a sidecar. See `runtime.md`.

## Status

| Piece | State |
|---|---|
| Runtime kernel (manifests, secrets, compose, daemon, CLI) | shipped |
| Backend: auth, meeting → approval → GitHub loop | shipped |
| Desktop: auth, clients/projects/timeline, meeting review, runtime admin | shipped |
| Client & project entities + event backbone + timeline | shipped |
| Transactional outbox (durable external writes) | shipped |
| GitHub adapter (real REST, token-selected; stub offline) | shipped |
| GitHub webhooks in → timeline (+ todo auto-complete) | shipped |
| Todos & decisions entities (meeting tasks sync into todos) | shipped |
| SMTP mailer + approval email (durable via outbox) | shipped |
| Knowledge engine (embed/chat capabilities, ingest + reindex + scoped ask) | shipped |
| Client portal (magic-link auth, dashboard, Relay AI chat, approvals) | shipped |
| Remaining adapters (GitLab, Bitbucket, Slack, Discord, GCal, S3) | planned |
| Temporal | planned — subsumes the outbox |
