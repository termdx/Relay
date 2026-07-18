import { relations } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { projects } from '../project/project.schema';

export type DecisionSource = 'manual' | 'meeting' | 'approval';

/**
 * A first-class decision record (database.md): what was decided, when, by
 * whom, from which source. Immutable — a reversal is a new decision that
 * references the old one in its detail.
 */
export const decisions = pgTable('decisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  detail: text('detail').notNull().default(''),
  /** "owner" or the client's email — who made the call. */
  decidedBy: text('decided_by').notNull(),
  source: text('source').$type<DecisionSource>().notNull().default('manual'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const decisionsRelations = relations(decisions, ({ one }) => ({
  project: one(projects, {
    fields: [decisions.projectId],
    references: [projects.id],
  }),
}));

export type Decision = typeof decisions.$inferSelect;
