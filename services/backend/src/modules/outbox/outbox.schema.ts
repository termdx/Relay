import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export type OutboxStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';

/**
 * Transactional outbox (temporal.md ladder, rung 2): external side effects are
 * enqueued in the same transaction as the state change that caused them, then
 * relayed with retry. Handlers must be idempotent — redelivery is expected.
 */
export const outboxMessages = pgTable('outbox_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Handler key, e.g. "approval.decided". */
  type: text('type').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  status: text('status').$type<OutboxStatus>().notNull().default('PENDING'),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type OutboxMessage = typeof outboxMessages.$inferSelect;
