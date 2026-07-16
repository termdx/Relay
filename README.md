# Relay App

is an AI-native operating system for software agencies.

Unlike Jira or ClickUp, Agency OS is not a project management tool.

It is the orchestration layer responsible for:

- Clients
- Developers
- Projects
- AI
- Meetings
- Deployments
- Billing
- Knowledge
- Automation

The desktop application acts as the control plane while the backend is the source of truth.

## Documents

.specs/

- architecture.md
- backend.md
- desktop.md
- ai.md
- temporal.md
- database.md
- events.md
- security.md
- integrations.md
- deployment.md
- coding-standards.md

This documentation defines the initial technical architecture for Relay app.

## Monorepo layout

pnpm workspace. Only the desktop app is scaffolded today; the other pillars
have reserved homes so the layout mirrors the target architecture.

```
apps/
  desktop/        Tauri v2 + React + TypeScript control plane (SQLite local)
packages/         Shared TS libraries (@relay/*) — see packages/README.md
services/         Backend / AI runtime / orchestrator — see services/README.md
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
pnpm desktop:dev      # run the Tauri desktop app in dev mode
pnpm desktop:build    # produce a production desktop bundle
```

