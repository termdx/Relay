# Events

Events are Relay's circulatory system. Services publish domain events instead
of invoking each other; the timeline records them; the knowledge engine
ingests them.

## Sources

- **Internal** — module actions: `ClientCreated`, `MeetingDrafted`,
  `ApprovalDecided`, `TodoCompleted`, `DecisionRecorded`.
- **External** — integration webhooks normalized by adapters: `PROpened`,
  `PRMerged`, `IssueClosed`, `MessagePosted`, `CalendarEventScheduled`,
  `DeploymentCompleted`.

## Shape

Every event carries: `id`, `type`, `occurredAt`, `clientId?`, `projectId?`,
`actor` (user | client | integration | ai), `payload`, `source` (module or
integration id). Events with a `projectId` become timeline entries.

## Consumers

| Consumer | Reaction |
|---|---|
| timeline | Append to the project feed (immutable) |
| knowledge | Chunk + embed into the knowledge base |
| notification | Fan out to Slack/Discord/email per rules |
| orchestration | Trigger/advance workflows (e.g. approval → publish issues) |

## Delivery

- Today: in-process NestJS event emitter (approval → meeting handler).
- Next: **transactional outbox** — events written in the same transaction as
  state, relayed asynchronously. This is the minimum bar before external
  side effects hang off events.
- Later: Temporal signals/workflows subsume the retry/durability concerns
  (see `temporal.md`).

Handlers must be idempotent: redelivery is expected.
