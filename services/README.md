# services/

Backend and runtime services for Relay. Nothing here is built yet — this
directory reserves a clear home for each pillar so the monorepo layout reflects
the target architecture.

Planned services (see root `README.md` for the full architecture):

- `backend/` — NestJS modular monolith. **System of Record** (PostgreSQL +
  Redis). Owns clients, projects, users, meetings, permissions, deployments.
- `ai-runtime/` — LangGraph + LiteLLM. **System of Intelligence**. Planning,
  summarization, reasoning, task extraction, Q&A. Exposes tools; never touches
  business data directly.
- `orchestrator/` — Temporal workers/workflows. **System of Orchestration**.
  Retries, timers, approvals, long-running automation. No business logic.

Each service is added as its own pnpm workspace package when work on it begins.
