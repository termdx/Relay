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

- **In-process bus** (shipped) — the firehose for derived state: timeline
  today, knowledge later. At-most-once is acceptable here (rebuildable).
- **Transactional outbox** (shipped) — external side effects are enqueued in
  the same transaction as the state change, relayed with SKIP LOCKED claims
  and exponential backoff (2s → 5min cap, 8 attempts, then parked FAILED).
  The approval → publish-issues step runs on it.
- Later: Temporal signals/workflows subsume the retry/durability concerns
  (see `temporal.md`).

Handlers must be idempotent: redelivery is expected.
