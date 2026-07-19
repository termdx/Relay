# services/

Backend and runtime services for Relay (see `.specs/` for the architecture).

- `backend/` — NestJS modular monolith. **System of Record** (PostgreSQL +
  pgvector). Owns clients, projects, timeline, meetings, approvals; emits
  domain events on the in-process bus. AI lives behind capability ports
  (draft/chat/embed) with provider adapters — no agent framework; the
  knowledge engine builds on pgvector in the same database.
- `runtime/` — the Runtime HTTP daemon (`:51720`). Thin transport over
  `@relay/runtime-core` (workspace manifests, secrets, compose generation,
  lifecycle). Ships inside the desktop as a Tauri sidecar.

Planned:

- `orchestrator/` — Temporal workers/workflows. **System of Orchestration**.
  Retries, timers, approvals, long-running automation. Agent loops run as
  activities using provider SDKs' native tool-calling. No business logic.

The client-facing portal (`relay.<company>.com`) shipped as `apps/portal` —
a Vite/React SPA over the backend's scoped `/portal/*` API.
