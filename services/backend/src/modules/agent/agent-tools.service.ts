import { Injectable } from '@nestjs/common';
import { Type } from '@google/genai';
import { DecisionService } from '../decision/decision.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
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
 * The tools an agent may call — Relay's own data, always scoped to the run's
 * project, writes attributed to the agent (ai actor on the timeline). This
 * registry is the whole capability surface; there is no filesystem, network,
 * or cross-project reach.
 */
@Injectable()
export class AgentToolsService {
  private readonly tools: AgentTool[];

  constructor(
    knowledge: KnowledgeService,
    todos: TodoService,
    decisions: DecisionService,
    timeline: TimelineService,
  ) {
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

  /** Tools visible to a run: manifest allowlist, or all when unspecified. */
  select(allowlist: string[]): AgentTool[] {
    if (allowlist.length === 0) return this.tools;
    return this.tools.filter((tool) => allowlist.includes(tool.name));
  }

  find(name: string): AgentTool | undefined {
    return this.tools.find((tool) => tool.name === name);
  }
}
