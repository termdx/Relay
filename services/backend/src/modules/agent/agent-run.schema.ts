import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { projects } from '../project/project.schema';

export type RunStatus = 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED';

/** One executed tool call, kept for the run trace. */
export interface ToolTraceEntry {
  tool: string;
  args: Record<string, unknown>;
  result: string;
}

/**
 * An agent run: one instruction executed by the tool-calling loop against a
 * project. Queued via the outbox; executed at-most-once (a failure marks the
 * row FAILED rather than blindly retrying side-effectful tool calls).
 */
export const agentRuns = pgTable('agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Manifest identity, supplied by the caller (the runtime owns manifests). */
  agentId: text('agent_id').notNull(),
  agentName: text('agent_name').notNull(),
  model: text('model').notNull(),
  /** Tool allowlist from the manifest; empty = all tools. */
  tools: jsonb('tools').$type<string[]>().notNull().default([]),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  instruction: text('instruction').notNull(),
  status: text('status').$type<RunStatus>().notNull().default('QUEUED'),
  output: text('output'),
  trace: jsonb('trace').$type<ToolTraceEntry[]>().notNull().default([]),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type AgentRun = typeof agentRuns.$inferSelect;

export interface WorkflowStepResult {
  agentId: string;
  instruction: string;
  output: string;
}

/** A workflow run: sequential agent steps, each fed the previous output. */
export const workflowRuns = pgTable('workflow_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowId: text('workflow_id').notNull(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  /** [{agent: {agentId, agentName, model, tools}, instruction}] */
  steps: jsonb('steps').$type<
    {
      agent: { agentId: string; agentName: string; model: string; tools: string[] };
      instruction: string;
    }[]
  >().notNull(),
  status: text('status').$type<RunStatus>().notNull().default('QUEUED'),
  results: jsonb('results').$type<WorkflowStepResult[]>().notNull().default([]),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type WorkflowRun = typeof workflowRuns.$inferSelect;
