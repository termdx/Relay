# Deployment

Relay is self-hosted: an agency runs its own stack and its own portal domain.

## Model

The **runtime generates the deployment**. Installed modules + integrations +
AI providers → `docker-compose.yml` + `.env` (secrets injected from the
encrypted store). The same mechanism serves local dev and a VPS.

## Components

| Component | When |
|---|---|
| Backend API (NestJS) | now |
| PostgreSQL + pgvector | now |
| Runtime daemon | now (desktop sidecar; systemd service on a VPS) |
| Client portal (web) | with portal |
| MinIO (S3-compatible) | with storage module, self-hosted default |
| Amazon S3 | production object storage (instead of MinIO) |
| SMTP relay | with mailer (external provider credentials) |
| Redis | when a concrete need lands |
| Temporal server + workers | with orchestration layer |

## Portal hosting

`relay.<company>.com` → reverse proxy (Caddy/nginx) → portal app → backend
scoped API. TLS via the proxy. Per-agency branding from workspace config.

## Later

- Helm chart / Kubernetes once compose stops being enough.
- Managed offering is out of scope for now; the runtime's manifest model is
  the path to it.
