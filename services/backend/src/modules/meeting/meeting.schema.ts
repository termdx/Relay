import { relations } from 'drizzle-orm';
import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export type MeetingStatus =
  | 'DRAFTED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'CHANGES_REQUESTED';

export const meetings = pgTable('meetings', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  transcript: text('transcript').notNull(),
  clientEmail: text('client_email').notNull(),
  /** Target repo for pushed tasks, "owner/repo". Becomes a Project relation later. */
  githubRepo: text('github_repo').notNull(),
  status: text('status').$type<MeetingStatus>().notNull().default('DRAFTED'),
  summary: text('summary'),
  /** The client's most recent response comment, surfaced to the founder. */
  clientComment: text('client_comment'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const meetingTasks = pgTable('meeting_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  meetingId: uuid('meeting_id')
    .notNull()
    .references(() => meetings.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  assignee: text('assignee'),
  /** Set once the task has been pushed to GitHub on approval. */
  githubIssueUrl: text('github_issue_url'),
  position: integer('position').notNull().default(0),
});

export const meetingsRelations = relations(meetings, ({ many }) => ({
  tasks: many(meetingTasks),
}));

export const meetingTasksRelations = relations(meetingTasks, ({ one }) => ({
  meeting: one(meetings, {
    fields: [meetingTasks.meetingId],
    references: [meetings.id],
  }),
}));

export type Meeting = typeof meetings.$inferSelect;
export type MeetingTask = typeof meetingTasks.$inferSelect;
export type MeetingWithTasks = Meeting & { tasks: MeetingTask[] };
