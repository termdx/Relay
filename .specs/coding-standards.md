# Coding Standards

## General

- Feature-first folder structure; every module owns its domain end to end
  (schema, DTOs, service, controller, events).
- Dependency injection everywhere; depend on ports (symbols + interfaces),
  not concrete adapters.
- Strong typing: strict TypeScript, zod at every boundary (manifests, DTOs,
  webhook payloads, AI outputs).

## Rules

1. No business logic in controllers.
2. No AI calls from controllers; AI is behind capability ports with a stub
   implementation for offline dev/test.
3. Prefer events over tight coupling; handlers are idempotent.
4. External writes are durable and retried (outbox/Temporal) — never fired
   directly from a request or event handler once real adapters exist.
5. Vendor payloads never cross an adapter boundary — normalize at the edge.
6. Every module owns its Drizzle schema file; the database barrel composes
   them.
7. Keep ports stable; extend by adding capabilities, not by breaking callers.
8. Secrets only via the runtime secret store — never in manifests, env files
   in git, or code.
9. Client-visible output requires an approval record before side effects.
10. Write integration tests for workflows and adapters (stub-backed).
