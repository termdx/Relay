/**
 * The domain event envelope (events.md). Every signal Relay tracks — internal
 * module actions and normalized integration webhooks — is one of these.
 * Events with a `projectId` become timeline entries; the knowledge engine
 * ingests them later.
 */

/** Who caused the event. */
export type DomainActor =
  | { kind: 'user'; id: string }
  | { kind: 'client'; email: string }
  | { kind: 'integration'; id: string }
  | { kind: 'ai'; id: string }
  | { kind: 'system' };

export interface DomainEvent<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Dotted event name, e.g. "client.created". */
  type: string;
  occurredAt: Date;
  clientId?: string;
  projectId?: string;
  actor: DomainActor;
  /** Owning module or integration id, e.g. "meeting", "github". */
  source: string;
  payload: TPayload;
}

/** Firehose channel every domain event is re-emitted on (timeline, knowledge). */
export const DOMAIN_EVENT = 'domain.event';

// ── Event names ──────────────────────────────────────────────────────────────
export const CLIENT_CREATED = 'client.created';
export const PROJECT_CREATED = 'project.created';
export const MEETING_DRAFTED = 'meeting.drafted';
export const MEETING_SENT_FOR_APPROVAL = 'meeting.sent_for_approval';
export const MEETING_APPROVED = 'meeting.approved';
export const MEETING_CHANGES_REQUESTED = 'meeting.changes_requested';
export const GITHUB_PUSH = 'github.push';
export const GITHUB_PR_OPENED = 'github.pr_opened';
export const GITHUB_PR_MERGED = 'github.pr_merged';
export const GITHUB_PR_CLOSED = 'github.pr_closed';
export const GITHUB_ISSUE_OPENED = 'github.issue_opened';
export const GITHUB_ISSUE_CLOSED = 'github.issue_closed';
export const TODO_CREATED = 'todo.created';
export const TODO_COMPLETED = 'todo.completed';
export const TODO_REOPENED = 'todo.reopened';
export const DECISION_RECORDED = 'decision.recorded';
export const NOTIFICATION_SENT = 'notification.sent';
