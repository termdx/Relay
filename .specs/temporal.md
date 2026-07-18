# Orchestration

Durable execution for everything that touches the outside world or runs long.

## Why

The moment a real integration adapter ships, a naked event handler is a
liability: approval lands, the GitHub publish fails mid-flight, state is stuck
and idempotency blocks the retry (the meeting module carries exactly this
known limitation today). External writes need retries, timeouts, and
compensation as infrastructure — not hand-rolled per call site.

## Ladder

1. ~~In-process events~~ — retained only for derived state (timeline).
2. **Now: transactional outbox** (shipped) — side effects persisted in the
   same transaction as state, relayed with SKIP LOCKED + exponential backoff.
   The approval → GitHub publish runs on it; survives process restarts.
3. **Target: Temporal** — workflows own multi-step processes; backend modules
   keep the business logic and are invoked as activities.

## Temporal workflows (target)

- Meeting processing: draft → approval wait → publish issues → notify client.
- Client onboarding: portal invite → integration linking → kickoff digest.
- Weekly report: gather timeline → draft digest → approval → email via SMTP.
- Knowledge ingestion backfill: replay timeline → chunk → embed.

## Rules

- Workflows coordinate; modules decide. No business logic in workflow code.
- Activities are idempotent — publishing twice must be safe.
- AI reasoning steps are activities like any other (retryable, timeboxed).
