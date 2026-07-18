# Security

## Identities

- **Owner / team** — full workspace access via JWT (owner setup + login exist
  today; team members and RBAC follow).
- **Clients** — scoped portal identities (magic link today via approvals;
  invited accounts later). A client can only ever reach their own projects.

## Boundaries

- **Tenant isolation at the query layer.** Portal API and knowledge retrieval
  filter by client/project in SQL — never by prompt instructions or UI hiding.
- **Approval gate.** No external side effect (issue, email, portal publish)
  without a persisted approval record.
- **Secrets.** Integration credentials and API keys live in the runtime's
  encrypted store (master key + secrets file, 0600); manifests and generated
  artifacts reference them, never contain them.
- **Webhooks.** Every inbound webhook is signature-verified per vendor before
  normalization; unverifiable payloads are dropped and logged.
- **AI surface.** The portal chatbot is grounded-retrieval only; retrieved
  scope is enforced before the model sees anything. Prompt injection in
  ingested content cannot widen scope because scope is not model-controlled.

## Mechanics

- JWT (+ refresh tokens planned), HTTPS everywhere in deployment.
- Audit log: approvals, credential changes, portal access (planned).
- Magic-link tokens are single-purpose, expiring, and revocable.
