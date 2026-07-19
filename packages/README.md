# packages/

Shared libraries consumed by apps and services across the Relay monorepo.

- `runtime-core/` — the workspace kernel: declarative YAML manifests
  (modules, integrations, AI providers, workflows, agents), encrypted
  secrets, dependency resolution, deterministic `docker-compose.yml` + `.env`
  generation, and stack lifecycle. The single writer of workspace state.
- `runtime-client/` — the typed `RuntimeApi` contract over the kernel, with
  two transports: `InProcessClient` (opens the engine directly, for
  bootstrap/one-shot calls) and `HttpClient` (POSTs to the runtime daemon's
  `/rpc`). Consumed by the CLI and the daemon.

Each package is a pnpm workspace member named `@relay/<name>`.
