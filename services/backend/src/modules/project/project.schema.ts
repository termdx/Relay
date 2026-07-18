import { relations } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { clients } from '../client/client.schema';

export type ProjectStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED';

/**
 * A project under a client. Links to the client's external tool surfaces
 * (repo today; channels and calendars as those integrations land) so events
 * can be attributed to the right project.
 */
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').$type<ProjectStatus>().notNull().default('ACTIVE'),
  /** "owner/repo" — where approved tasks land. Multi-repo comes later. */
  githubRepo: text('github_repo'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const projectsRelations = relations(projects, ({ one }) => ({
  client: one(clients, {
    fields: [projects.clientId],
    references: [clients.id],
  }),
}));

export type Project = typeof projects.$inferSelect;
