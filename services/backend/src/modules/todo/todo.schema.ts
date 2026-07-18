import { relations } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { projects } from '../project/project.schema';

export type TodoStatus = 'OPEN' | 'DONE';
export type TodoSource = 'manual' | 'meeting';

/**
 * A tracked todo on a project (database.md) — created by hand or extracted
 * from an approved meeting. May mirror an external issue (externalUrl).
 */
export const todos = pgTable('todos', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  status: text('status').$type<TodoStatus>().notNull().default('OPEN'),
  assignee: text('assignee'),
  source: text('source').$type<TodoSource>().notNull().default('manual'),
  /** Idempotency key for synced todos (e.g. the meeting task id) — the same
   * source row can never create two todos, however often it's redelivered. */
  sourceRef: text('source_ref').unique(),
  /** The mirrored external issue (GitHub today). */
  externalUrl: text('external_url'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const todosRelations = relations(todos, ({ one }) => ({
  project: one(projects, {
    fields: [todos.projectId],
    references: [projects.id],
  }),
}));

export type Todo = typeof todos.$inferSelect;
