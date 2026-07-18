import { relations } from 'drizzle-orm';
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { clients } from '../client/client.schema';
import { projects } from '../project/project.schema';
import type { DomainActor } from '../../events/domain-event';

/**
 * Append-only project feed (events.md): every domain event carrying a
 * projectId lands here. Immutable — corrections are new events. This is the
 * record the knowledge engine will replay.
 */
export const timelineEvents = pgTable('timeline_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  /** Denormalized for portal scoping without a join. */
  clientId: uuid('client_id').references(() => clients.id, {
    onDelete: 'cascade',
  }),
  /** Dotted event name, e.g. "meeting.approved". */
  type: text('type').notNull(),
  actor: jsonb('actor').$type<DomainActor>().notNull(),
  payload: jsonb('payload')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  /** Owning module or integration id. */
  source: text('source').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const timelineEventsRelations = relations(timelineEvents, ({ one }) => ({
  project: one(projects, {
    fields: [timelineEvents.projectId],
    references: [projects.id],
  }),
}));

export type TimelineEvent = typeof timelineEvents.$inferSelect;
