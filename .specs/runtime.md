# Runtime

The runtime is Relay's kernel: it turns a declarative workspace into a running
stack. It is the most mature layer of the codebase.

## Model

A workspace (`~/.relay/workspaces/<name>/`) is a directory of YAML manifests:

```
relay.yaml            workspace config
modules/<id>.yaml     installable feature modules
integrations/<id>.yaml external tool connections
ai/<id>.yaml          AI providers + capabilities
workflows/<id>.yaml   workflow definitions
agents/<id>.yaml      agent definitions
secrets/              encrypted credential store (master.key + secrets file)
generated/            docker-compose.yml, .env, runtime.lock — derived, never edited
```

Everything installable comes from a built-in **catalog**
(`runtime-core/src/catalog`). `relay module add meeting` copies the catalog
manifest into the workspace; dependency resolution pulls in required modules,
integrations, and AI capabilities.

## Engine

`RuntimeEngine` (runtime-core) is the composition root and the only writer of
workspace state:

- **Registries** — modules, integrations, AI providers, workflows, agents.
- **Secrets** — credentials referenced by `secretRef`, stored encrypted;
  manifests never contain values.
- **Generate** — derive `docker-compose.yml` + `.env` from installed manifests.
- **Lifecycle** — `up`/`down` drive docker compose against generated artifacts.
- **Health** — environment prerequisites, service health, workspace diagnostics.
- **Validate** — cross-manifest diagnostics (missing deps, dangling secrets).

## Transports

The engine is wrapped by two transports that add no logic:

- **In-process** — used by the CLI (`apps/cli`, `relay <cmd>`).
- **HTTP daemon** — `services/runtime` on `:51720`; used by the desktop, which
  bundles the daemon as a Tauri sidecar binary.

## Direction

- The catalog grows with each integration in `integrations.md` — an
  integration ships as: catalog entry (credentials, webhooks, health checks) +
  a backend adapter module.
- A remote registry may eventually replace the built-in catalog; the manifest
  format is the stable contract.
