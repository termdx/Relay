import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED';

/** Immutable snapshot of exactly what the client is asked to approve. */
export interface ApprovalPayload {
  title: string;
  summary: string;
  tasks: { title: string; body: string; assignee?: string | null }[];
}

export const approvals = pgTable('approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  /**
   * The meeting this approval belongs to. Intentionally NOT a foreign key:
   * the approval module owns its own state and never joins to the meeting
   * module's tables — it carries a frozen payload instead.
   */
  meetingId: uuid('meeting_id').notNull(),
  /** Magic-link secret. This is the client's only credential in v0.1. */
  token: text('token').notNull().unique(),
  status: text('status').$type<ApprovalStatus>().notNull().default('PENDING'),
  /** Frozen at send time so the record reflects what was actually agreed. */
  payload: jsonb('payload').$type<ApprovalPayload>().notNull(),
  clientComment: text('client_comment'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
});

export type Approval = typeof approvals.$inferSelect;
