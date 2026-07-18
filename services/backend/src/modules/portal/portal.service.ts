import {
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { DRIZZLE, type RelayDb } from '../../database/drizzle.provider';
import { approvals } from '../approval/approval.schema';
import { clients, type Client } from '../client/client.schema';
import { decisions, type Decision } from '../decision/decision.schema';
import { KnowledgeService, type AskResult } from '../knowledge/knowledge.service';
import { meetings } from '../meeting/meeting.schema';
import { projects, type Project } from '../project/project.schema';
import { timelineEvents, type TimelineEvent } from '../timeline/timeline.schema';
import { todos, type Todo } from '../todo/todo.schema';

/** Event types a client may see. Internal noise stays internal. */
const CLIENT_SAFE_EVENTS = [
  'project.created',
  'meeting.sent_for_approval',
  'meeting.approved',
  'meeting.changes_requested',
  'todo.created',
  'todo.completed',
  'todo.reopened',
  'decision.recorded',
  'github.push',
  'github.pr_opened',
  'github.pr_merged',
  'github.issue_opened',
  'github.issue_closed',
];

export interface PortalOverview {
  todos: { open: number; done: number };
  last30Days: {
    commits: number;
    prsMerged: number;
    issuesClosed: number;
    meetingsApproved: number;
    decisions: number;
  };
  /** Oldest → newest, 8 ISO week-start dates with event counts. */
  weeklyActivity: { weekStart: string; events: number }[];
  lastActivityAt: Date | null;
}

export interface PortalApproval {
  id: string;
  meetingTitle: string;
  status: string;
  respondedAt: Date | null;
  createdAt: Date;
  /** Path on the backend host; the portal composes the full URL. */
  approvePath: string;
}

/**
 * All portal reads. Every query is scoped by clientId in the WHERE clause —
 * project ownership is verified before any project-keyed data is touched.
 */
@Injectable()
export class PortalService {
  constructor(
    @Inject(DRIZZLE) private readonly db: RelayDb,
    private readonly knowledge: KnowledgeService,
  ) {}

  async me(clientId: string): Promise<{ client: Client; projects: Project[] }> {
    const client = await this.db.query.clients.findFirst({
      where: eq(clients.id, clientId),
    });
    if (!client) throw new NotFoundException('Client not found.');
    const owned = await this.db.query.projects.findMany({
      where: eq(projects.clientId, clientId),
      orderBy: [desc(projects.updatedAt)],
    });
    return { client, projects: owned };
  }

  /** Throws unless the project belongs to the authenticated client. */
  private async assertOwnership(
    clientId: string,
    projectId: string,
  ): Promise<void> {
    const project = await this.db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.clientId, clientId)),
      columns: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found.');
  }

  async overview(clientId: string, projectId: string): Promise<PortalOverview> {
    await this.assertOwnership(clientId, projectId);

    const todoRows = await this.db
      .select({ status: todos.status, count: sql<number>`count(*)::int` })
      .from(todos)
      .where(eq(todos.projectId, projectId))
      .groupBy(todos.status);
    const todoCount = (status: string) =>
      todoRows.find((r) => r.status === status)?.count ?? 0;

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const typeRows = await this.db
      .select({ type: timelineEvents.type, count: sql<number>`count(*)::int` })
      .from(timelineEvents)
      .where(
        and(
          eq(timelineEvents.projectId, projectId),
          gte(timelineEvents.occurredAt, since),
        ),
      )
      .groupBy(timelineEvents.type);
    const typeCount = (type: string) =>
      typeRows.find((r) => r.type === type)?.count ?? 0;

    const weekly = await this.db
      .select({
        weekStart: sql<string>`to_char(date_trunc('week', ${timelineEvents.occurredAt}), 'YYYY-MM-DD')`,
        events: sql<number>`count(*)::int`,
      })
      .from(timelineEvents)
      .where(
        and(
          eq(timelineEvents.projectId, projectId),
          gte(
            timelineEvents.occurredAt,
            new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000),
          ),
          inArray(timelineEvents.type, CLIENT_SAFE_EVENTS),
        ),
      )
      .groupBy(sql`date_trunc('week', ${timelineEvents.occurredAt})`)
      .orderBy(sql`date_trunc('week', ${timelineEvents.occurredAt})`);

    const [latest] = await this.db
      .select({ at: timelineEvents.occurredAt })
      .from(timelineEvents)
      .where(eq(timelineEvents.projectId, projectId))
      .orderBy(desc(timelineEvents.occurredAt))
      .limit(1);

    return {
      todos: { open: todoCount('OPEN'), done: todoCount('DONE') },
      last30Days: {
        commits: typeCount('github.push'),
        prsMerged: typeCount('github.pr_merged'),
        issuesClosed: typeCount('github.issue_closed'),
        meetingsApproved: typeCount('meeting.approved'),
        decisions: typeCount('decision.recorded'),
      },
      weeklyActivity: weekly,
      lastActivityAt: latest?.at ?? null,
    };
  }

  async feed(clientId: string, projectId: string): Promise<TimelineEvent[]> {
    await this.assertOwnership(clientId, projectId);
    return this.db.query.timelineEvents.findMany({
      where: and(
        eq(timelineEvents.projectId, projectId),
        inArray(timelineEvents.type, CLIENT_SAFE_EVENTS),
      ),
      orderBy: [desc(timelineEvents.occurredAt)],
      limit: 60,
    });
  }

  async todosFor(clientId: string, projectId: string): Promise<Todo[]> {
    await this.assertOwnership(clientId, projectId);
    return this.db.query.todos.findMany({
      where: eq(todos.projectId, projectId),
      orderBy: [desc(todos.updatedAt)],
      limit: 100,
    });
  }

  async decisionsFor(clientId: string, projectId: string): Promise<Decision[]> {
    await this.assertOwnership(clientId, projectId);
    return this.db.query.decisions.findMany({
      where: eq(decisions.projectId, projectId),
      orderBy: [desc(decisions.createdAt)],
    });
  }

  async approvalsFor(clientId: string): Promise<PortalApproval[]> {
    const rows = await this.db
      .select({
        id: approvals.id,
        token: approvals.token,
        status: approvals.status,
        respondedAt: approvals.respondedAt,
        createdAt: approvals.createdAt,
        meetingTitle: meetings.title,
      })
      .from(approvals)
      .innerJoin(meetings, eq(approvals.meetingId, meetings.id))
      .innerJoin(projects, eq(meetings.projectId, projects.id))
      .where(eq(projects.clientId, clientId))
      .orderBy(desc(approvals.createdAt))
      .limit(50);

    return rows.map((row) => ({
      id: row.id,
      meetingTitle: row.meetingTitle,
      status: row.status,
      respondedAt: row.respondedAt,
      createdAt: row.createdAt,
      approvePath: `/approve/${row.token}`,
    }));
  }

  async ask(
    clientId: string,
    projectId: string,
    question: string,
  ): Promise<AskResult> {
    await this.assertOwnership(clientId, projectId);
    return this.knowledge.ask(projectId, question);
  }
}
