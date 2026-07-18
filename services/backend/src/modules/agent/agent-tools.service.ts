import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Type } from '@google/genai';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type RelayDb } from '../../database/drizzle.provider';
import { users } from '../auth/auth.schema';
import { DecisionService } from '../decision/decision.service';
import {
  GITHUB_ISSUE_PUBLISHER,
  type GithubIssuePublisher,
} from '../integration/github/github-issue-publisher';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { ChatNotifier } from '../notification/chat-notifier';
import { MAILER, type Mailer } from '../notification/mailer';
import { projects } from '../project/project.schema';
import { TimelineService } from '../timeline/timeline.service';
import { TodoService } from '../todo/todo.service';

export interface AgentToolContext {
  projectId: string;
  agentId: string;
}

interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(
    context: AgentToolContext,
    args: Record<string, unknown>,
  ): Promise<string>;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * The tools an agent may call. CORE tools (Relay's own data, scoped to the
 * run's project) are always available; INTEGRATION tools (issue tracker,
 * team chat, email) exist only when the agent's allowlist grants them — the
 * allowlist is the owner's consent. This registry is the whole capability
 * surface; there is no filesystem, network, or cross-project reach.
 */
@Injectable()
export class AgentToolsService {
  private readonly tools: AgentTool[];
  private readonly integrationTools: AgentTool[];

  constructor(
    @Inject(DRIZZLE) db: RelayDb,
    @Inject(GITHUB_ISSUE_PUBLISHER) issues: GithubIssuePublisher,
    @Inject(MAILER) mailer: Mailer,
    config: ConfigService,
    chat: ChatNotifier,
    knowledge: KnowledgeService,
    todos: TodoService,
    decisions: DecisionService,
    timeline: TimelineService,
  ) {
    this.integrationTools = [
      {
        name: 'list_repo_issues',
        description:
          "List issues from the project's repository, filtered by state (open, closed, or all). Returns number, state, and title.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            state: {
              type: Type.STRING,
              description: 'open | closed | all (default all)',
            },
          },
        },
        execute: async (ctx, args) => {
          const project = await db.query.projects.findFirst({
            where: eq(projects.id, ctx.projectId),
            columns: { githubRepo: true },
          });
          if (!project?.githubRepo) {
            return 'This project has no repository configured.';
          }
          if (/^(gitlab|bitbucket):/.test(project.githubRepo)) {
            return 'Issue listing is only supported for GitHub repositories so far.';
          }
          const token = config.get<string>('GITHUB_TOKEN');
          if (!token) return 'GitHub is not connected (no token).';
          const state = ['open', 'closed', 'all'].includes(str(args.state))
            ? str(args.state)
            : 'all';
          const res = await fetch(
            `https://api.github.com/repos/${project.githubRepo}/issues?state=${state}&per_page=30`,
            {
              headers: {
                authorization: `Bearer ${token}`,
                accept: 'application/vnd.github+json',
                'user-agent': 'relay-backend',
                'x-github-api-version': '2022-11-28',
              },
            },
          );
          if (!res.ok) {
            return `GitHub issue listing failed (HTTP ${res.status}).`;
          }
          const data = (await res.json()) as {
            number: number;
            state: string;
            title: string;
            pull_request?: unknown;
          }[];
          const issuesOnly = data.filter((item) => !item.pull_request);
          if (issuesOnly.length === 0) return `No ${state} issues found.`;
          return issuesOnly
            .map((item) => `#${item.number} [${item.state}] ${item.title}`)
            .join('\n');
        },
      },
      {
        name: 'get_ci_status',
        description:
          "Latest CI results for the project's repository (GitHub Actions workflow runs): workflow name, branch, status, conclusion, and link.",
        parameters: { type: Type.OBJECT, properties: {} },
        execute: async (ctx) => {
          const project = await db.query.projects.findFirst({
            where: eq(projects.id, ctx.projectId),
            columns: { githubRepo: true },
          });
          if (!project?.githubRepo) {
            return 'This project has no repository configured.';
          }
          if (/^(gitlab|bitbucket):/.test(project.githubRepo)) {
            return 'CI status is only supported for GitHub repositories so far.';
          }
          const token = config.get<string>('GITHUB_TOKEN');
          if (!token) return 'GitHub is not connected (no token).';
          const res = await fetch(
            `https://api.github.com/repos/${project.githubRepo}/actions/runs?per_page=8`,
            {
              headers: {
                authorization: `Bearer ${token}`,
                accept: 'application/vnd.github+json',
                'user-agent': 'relay-backend',
                'x-github-api-version': '2022-11-28',
              },
            },
          );
          if (!res.ok) {
            return `CI lookup failed (HTTP ${res.status}) — the repo may have no Actions workflows.`;
          }
          const data = (await res.json()) as {
            workflow_runs?: {
              name?: string;
              head_branch?: string;
              status?: string;
              conclusion?: string | null;
              html_url?: string;
              updated_at?: string;
            }[];
          };
          const runs = data.workflow_runs ?? [];
          if (runs.length === 0) {
            return 'No CI runs found — the repo has no GitHub Actions workflows yet.';
          }
          return runs
            .map(
              (run) =>
                `${(run.updated_at ?? '').slice(0, 16).replace('T', ' ')} "${run.name}" on ${run.head_branch}: ${
                  run.conclusion ?? run.status ?? 'unknown'
                } — ${run.html_url}`,
            )
            .join('\n');
        },
      },
      {
        name: 'publish_issue',
        description:
          "Create a real issue in the project's configured repository (GitHub/GitLab/Bitbucket).",
        parameters: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            body: { type: Type.STRING },
          },
          required: ['title'],
        },
        execute: async (ctx, args) => {
          const project = await db.query.projects.findFirst({
            where: eq(projects.id, ctx.projectId),
            columns: { githubRepo: true },
          });
          if (!project?.githubRepo) {
            return 'This project has no repository configured.';
          }
          const [issue] = await issues.publishIssues(project.githubRepo, [
            {
              title: str(args.title),
              body: `${str(args.body)}\n\n_Filed by agent ${ctx.agentId} via Relay._`,
            },
          ]);
          return `Created issue: ${issue?.url ?? 'unknown url'}`;
        },
      },
      {
        name: 'notify_team',
        description:
          'Post a short message to the team chat (Slack/Discord, whichever is connected).',
        parameters: {
          type: Type.OBJECT,
          properties: { message: { type: Type.STRING } },
          required: ['message'],
        },
        execute: async (ctx, args) => {
          if (!chat.hasSinks()) return 'No team chat is connected.';
          await chat.send(`🤖 ${str(args.message)} — agent ${ctx.agentId}`);
          return 'Posted to team chat.';
        },
      },
      {
        name: 'email_owner',
        description:
          "Email a report to the workspace owner (never to clients — client email always goes through the approval flow).",
        parameters: {
          type: Type.OBJECT,
          properties: {
            subject: { type: Type.STRING },
            body: { type: Type.STRING },
          },
          required: ['subject', 'body'],
        },
        execute: async (ctx, args) => {
          const [owner] = await db
            .select({ email: users.email })
            .from(users)
            .where(eq(users.role, 'owner'))
            .limit(1);
          if (!owner) return 'No workspace owner found.';
          await mailer.send({
            to: owner.email,
            subject: `[${ctx.agentId}] ${str(args.subject)}`,
            text: str(args.body),
          });
          return `Emailed the owner (${owner.email}).`;
        },
      },
    ];

    this.tools = [
      {
        name: 'search_knowledge',
        description:
          "Semantic search over the project's history (meetings, decisions, code activity, todos). Returns dated entries.",
        parameters: {
          type: Type.OBJECT,
          properties: { query: { type: Type.STRING } },
          required: ['query'],
        },
        execute: async (ctx, args) => {
          const chunks = await knowledge.retrieve(ctx.projectId, str(args.query), 6);
          if (chunks.length === 0) return 'No matching project history.';
          return chunks.map((c) => c.content).join('\n');
        },
      },
      {
        name: 'list_todos',
        description: 'List the project todos with their status.',
        parameters: { type: Type.OBJECT, properties: {} },
        execute: async (ctx) => {
          const items = await todos.listByProject(ctx.projectId);
          if (items.length === 0) return 'No todos.';
          return items
            .map((t) => `[${t.status}] ${t.title}${t.assignee ? ` (@${t.assignee})` : ''}`)
            .join('\n');
        },
      },
      {
        name: 'create_todo',
        description: 'Add a todo to the project.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            body: { type: Type.STRING },
          },
          required: ['title'],
        },
        execute: async (ctx, args) => {
          const todo = await todos.create(
            ctx.projectId,
            { title: str(args.title), body: str(args.body) || undefined },
            { kind: 'ai', id: ctx.agentId },
          );
          return `Created todo "${todo.title}" (${todo.id}).`;
        },
      },
      {
        name: 'record_decision',
        description:
          'Record a decision with its reasoning in the project decision log.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            detail: { type: Type.STRING },
          },
          required: ['title'],
        },
        execute: async (ctx, args) => {
          const decision = await decisions.create(
            ctx.projectId,
            { title: str(args.title), detail: str(args.detail) || undefined },
            { kind: 'ai', id: ctx.agentId },
          );
          return `Recorded decision "${decision.title}".`;
        },
      },
      {
        name: 'get_recent_activity',
        description: 'The latest project timeline events, newest first.',
        parameters: { type: Type.OBJECT, properties: {} },
        execute: async (ctx) => {
          const events = await timeline.listByProject(ctx.projectId, 15);
          if (events.length === 0) return 'No activity yet.';
          return events
            .map(
              (e) =>
                `${e.occurredAt.toISOString().slice(0, 10)} ${e.type} ${JSON.stringify(e.payload).slice(0, 120)}`,
            )
            .join('\n');
        },
      },
    ];
  }

  /** Core tools always; integration tools only when the allowlist grants them.
   * The "publish_issue" grant means "repo access" — it includes the read side
   * (issue listing, CI status), so existing manifests need no migration. */
  select(allowlist: string[]): AgentTool[] {
    const granted = new Set(allowlist);
    if (granted.has('publish_issue')) {
      granted.add('list_repo_issues');
      granted.add('get_ci_status');
    }
    return [
      ...this.tools,
      ...this.integrationTools.filter((tool) => granted.has(tool.name)),
    ];
  }

  find(name: string): AgentTool | undefined {
    return [...this.tools, ...this.integrationTools].find(
      (tool) => tool.name === name,
    );
  }
}
