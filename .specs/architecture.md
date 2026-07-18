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
| Backend: auth, meeting → approval → GitHub loop | shipped (GitHub adapter is a stub) |
| Desktop: auth, meeting review, runtime admin | shipped |
| Client & project entities | next |
| Timeline / events backbone | next |
| Knowledge engine | planned |
| Client portal + Relay AI chat | planned |
| Real integration adapters (the list in `integrations.md`) | planned |
| Temporal | planned — adopt before external adapters multiply |
