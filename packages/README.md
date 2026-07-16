# packages/

Shared libraries consumed by apps and services across the Relay monorepo.
Nothing here is built yet — this directory reserves the home for cross-cutting
code so it is never duplicated per app.

Likely first packages:

- `shared/` — shared TypeScript types and domain contracts (DTOs, event names).
- `tsconfig/` — shared tsconfig presets (currently `tsconfig.base.json` lives
  at the repo root; promote here if presets multiply).

Each package is a pnpm workspace member named `@relay/<name>`.
