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

## Distribution

Two installers, one CI pipeline. Releases are cut by pushing to the `dist`
branch — GitHub Actions (`.github/workflows/dist.yml`) builds every artifact
and attaches it to a release tagged `dist-<n>`:

| Artifact | Built on |
|---|---|
| `relay-runtime-<triple>` — standalone runtime daemon binary (bun-compiled) | macOS arm64, Linux x64 |
| Desktop bundles — `.dmg` / `.deb` (Tauri, sidecar included) | macOS arm64, Linux x64 |
| `portal-dist.tar.gz` — client portal static bundle | any |
| `ghcr.io/<owner>/relay-backend` — backend Docker image | any |
| `relay-backend-image.tar.gz` — same image as a loadable tarball (used when GHCR is private) | any |

```bash
git push origin main:dist     # cut a release
```

### Server install (agency VPS) — runtime + whole stack

One script installs the runtime binary, pulls the backend image, starts the
stack (Postgres + backend via the runtime's generated compose), and — given a
domain — serves the client portal with automatic TLS:

```bash
curl -fsSL https://raw.githubusercontent.com/termdx/Relay/main/scripts/install-server.sh \
  | bash -s -- --domain relay.youragency.com
```

Requires Docker and DNS (`relay.youragency.com` → the box). The installer:

- installs `relay-runtime` to `/usr/local/bin` + a systemd service
- pulls the backend image from GHCR, or — if the package is private — loads
  the `relay-backend-image.tar.gz` asset from the release instead
- generates a **runtime token** (`RELAY_RUNTIME_TOKEN`) — the daemon rejects
  any request without it; the token is printed at the end for the desktop
- exports `RELAY_PUBLIC_URL=https://<domain>` so approval links, portal
  sign-in emails, and webhook URLs all point at the real domain
- runs Caddy: the portal is served at `https://<domain>`, with `/portal/*`,
  `/approve/*`, `/webhooks/*`, and `/branding` proxied to the backend —
  which means notetaker/GitHub webhooks land on the same domain
- also proxies `/api/*` → backend and `/runtime/*` → runtime daemon, so the
  desktop app connects entirely over HTTPS on the domain — no VPN or extra
  open ports (only 80/443 need to be reachable)

### Desktop install

```bash
# from your agency's Relay server — fast, mirrored on their domain:
curl -fsSL https://raw.githubusercontent.com/termdx/Relay/main/scripts/install-desktop.sh \
  | bash -s -- --server https://relay.youragency.com

# or straight from GitHub releases:
curl -fsSL https://raw.githubusercontent.com/termdx/Relay/main/scripts/install-desktop.sh | bash
```

The server installer mirrors the desktop bundles at
`https://<domain>/downloads/` (browsable), so teammates never wait on
GitHub's CDN — grab `Relay.dmg` / `relay-desktop.deb` directly from there.

> **macOS says "Relay is damaged"?** The app is unsigned for now, and
> browser-downloaded files get quarantined, which macOS reports as damage.
> Fix: `xattr -cr /Applications/Relay.app` (the `curl | bash` installer
> avoids this — curl doesn't set the quarantine flag).

macOS gets the `.dmg`, Linux the `.deb`. On first run the app uses the
local stack; to work against an agency server open **Settings → Agency
server** and enter the Backend URL (`https://relay.youragency.com/api`),
the Runtime URL (`https://relay.youragency.com/runtime`), and the runtime
token printed by the server installer.

### Hosting model

```
relay.youragency.com  ──▶  Caddy (TLS)
   ├── /portal/* /approve/* /webhooks/* /branding  → backend :3000
   ├── /api/*      (desktop app)                    → backend :3000
   ├── /runtime/*  (desktop app, token-gated)       → runtime daemon :51720
   └── everything else                              → portal static files
Runtime daemon :51720 (token-protected)  → generates & drives the compose stack
Desktop app (each teammate's machine)    → https://<domain>/api + /runtime + token
```

