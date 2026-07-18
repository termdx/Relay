# Desktop

The founder's control plane. Tauri v2 + React + TypeScript.

## Responsibilities

- **Work surface** — meetings today; clients, projects, timeline, todos,
  decisions, and knowledge Q&A as those modules land.
- **Approval cockpit** — review AI drafts, edit, send for client approval.
- **Runtime admin** — manage the workspace: modules, integrations (credential
  entry), AI providers, workflows, agents; start/stop the stack; health.
- **Auth** — owner setup and login against the backend.

## Architecture

- Thin client: all business state lives in the backend; all workspace state
  lives in the runtime. The desktop renders and commands, it does not own.
- The runtime daemon ships as a **Tauri sidecar binary**; the desktop talks to
  it on `:51720` and to the backend on `:3000`.
- `pnpm dev:web` runs the same UI in a browser (no Rust build) for fast
  iteration.

## Later

- Local cache / offline queue if field use demands it (never the system of
  record).
- OS notifications on domain events.
