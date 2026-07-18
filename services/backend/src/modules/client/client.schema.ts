import { relations } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { projects } from '../project/project.schema';

/**
 * The anchor entity (database.md): everything — projects, timeline, knowledge,
 * portal access — hangs off a client.
 */
export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Contact person's name. */
  name: text('name').notNull(),
  /** Company / organization, when distinct from the person. */
  company: text('company'),
  /** Portal identity + approval-link recipient. */
  email: text('email').notNull().unique(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const clientsRelations = relations(clients, ({ many }) => ({
  projects: many(projects),
}));

export type Client = typeof clients.$inferSelect;
