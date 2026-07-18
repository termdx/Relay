# Relay

The operating system for freelancers, agencies, and indie hackers who build
and ship software for clients.

Relay is not another project-management tool. It connects the tools you
already use (GitHub, GitLab, Bitbucket, Slack, Discord, Google Calendar,
email, S3), tracks every event, todo, and decision per client, and maintains a
**knowledge base that is the source of truth** for the whole project
lifecycle. A client-facing portal at `relay.<company>.com` lets clients see
status and ask the Relay AI chatbot anything — answered from that knowledge
base.

The desktop app is the control plane; the backend is the system of record;
the knowledge engine is the source of truth.

## Documents

.specs/

- vision.md — who Relay is for and the core loop
- architecture.md — the four systems and how the layers fit
- runtime.md — the workspace/manifest kernel
- backend.md — modular monolith and its modules
- database.md — Postgres (+pgvector), S3 object storage
- knowledge.md — the knowledge engine (source of truth)
- portal.md — client portal + Relay AI chat
- integrations.md — ports, adapters, and the supported set
- events.md — the event backbone
- ai.md — capabilities, providers, approval rules
- desktop.md — the founder control plane
- temporal.md — orchestration ladder (outbox → Temporal)
- security.md — identities, isolation, secrets
- deployment.md — self-hosted model
- coding-standards.md

## Monorepo layout

```
apps/
  desktop/        Tauri v2 + React control plane (runtime daemon as sidecar)
  cli/            relay CLI over the runtime engine
packages/
  runtime-core/   Workspace kernel: manifests, secrets, compose, lifecycle
  runtime-client/ Typed client for the runtime API (in-process + HTTP)
services/
  backend/        NestJS modular monolith (system of record)
  runtime/        Runtime HTTP daemon (:51720)
tsconfig.base.json  Shared strict TypeScript config
pnpm-workspace.yaml Workspace definition
```

### Prerequisites

- Node.js >= 20 and pnpm >= 9
- Rust toolchain (`cargo`, `rustc`) and platform build deps for Tauri v2
  (see https://tauri.app/start/prerequisites/)

### Getting started

```bash
pnpm install          # install JS deps for all workspace packages
pnpm dev              # full local stack: runtime daemon + Postgres + backend + desktop
pnpm dev:local        # fast backend iteration (standalone Postgres + nest start)
pnpm dev:web          # desktop UI in the browser — no Rust build
pnpm desktop:build    # produce a production desktop bundle
```

