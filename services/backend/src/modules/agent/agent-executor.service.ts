import {
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, type Content } from '@google/genai';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type RelayDb } from '../../database/drizzle.provider';
import { DomainEventBus } from '../../events/domain-event-bus';
import { AGENT_RUN_COMPLETED } from '../../events/domain-event';
import { OutboxService } from '../outbox/outbox.service';
import { AgentToolsService, type AgentToolContext } from './agent-tools.service';
import {
  agentRuns,
  workflowRuns,
  type AgentRun,
  type ToolTraceEntry,
} from './agent-run.schema';

/** Outbox message types. */
export const AGENT_RUN = 'agent.run';
export const WORKFLOW_RUN = 'workflow.run';

const DEFAULT_MAX_TURNS = 12;

/**
 * Executes agent runs: a native function-calling loop (Gemini) over the
 * AgentToolsService registry. Delivered by the outbox but executed
 * AT-MOST-ONCE — any failure marks the row FAILED instead of throwing,
 * because blindly retrying side-effectful tool calls is worse than a failed
 * run the owner can re-trigger. Workflow runs are sequential agent steps.
 */
@Injectable()
export class AgentExecutorService implements OnModuleInit {
  private readonly logger = new Logger(AgentExecutorService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: RelayDb,
    private readonly config: ConfigService,
    private readonly tools: AgentToolsService,
    private readonly outbox: OutboxService,
    private readonly events: DomainEventBus,
  ) {}

  onModuleInit(): void {
    this.outbox.register(AGENT_RUN, async (payload) => {
      const { runId } = payload as { runId: string };
      await this.executeAgentRun(runId);
    });
    this.outbox.register(WORKFLOW_RUN, async (payload) => {
      const { runId } = payload as { runId: string };
      await this.executeWorkflowRun(runId);
    });
  }

  private async executeAgentRun(runId: string): Promise<void> {
    const run = await this.db.query.agentRuns.findFirst({
      where: eq(agentRuns.id, runId),
    });
    if (!run || run.status !== 'QUEUED') return; // redelivery or unknown: no-op

    await this.db
      .update(agentRuns)
      .set({ status: 'RUNNING' })
      .where(eq(agentRuns.id, runId));

    try {
      const { output, trace } = await this.runLoop(run);
      await this.db
        .update(agentRuns)
        .set({ status: 'DONE', output, trace })
        .where(eq(agentRuns.id, runId));
      this.events.emit({
        type: AGENT_RUN_COMPLETED,
        projectId: run.projectId,
        actor: { kind: 'ai', id: run.agentId },
        source: 'agent',
        payload: {
          runId,
          agentId: run.agentId,
          agentName: run.agentName,
          instruction: run.instruction.slice(0, 200),
          toolCalls: trace.length,
        },
      });
      this.logger.log(
        `agent ${run.agentId} run ${runId} done (${trace.length} tool calls)`,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await this.db
        .update(agentRuns)
        .set({ status: 'FAILED', error: detail })
        .where(eq(agentRuns.id, runId));
      this.logger.error(`agent run ${runId} failed: ${detail}`);
    }
  }

  private async executeWorkflowRun(runId: string): Promise<void> {
    const run = await this.db.query.workflowRuns.findFirst({
      where: eq(workflowRuns.id, runId),
    });
    if (!run || run.status !== 'QUEUED') return;

    await this.db
      .update(workflowRuns)
      .set({ status: 'RUNNING' })
      .where(eq(workflowRuns.id, runId));

    const results: { agentId: string; instruction: string; output: string }[] = [];
    try {
      let carry = '';
      for (const step of run.steps) {
        const instruction = carry
          ? `${step.instruction}\n\nOutput of the previous step:\n${carry}`
          : step.instruction;
        const { output } = await this.runLoop({
          agentId: step.agent.agentId,
          agentName: step.agent.agentName,
          model: step.agent.model,
          tools: step.agent.tools,
          projectId: run.projectId,
          instruction,
        });
        results.push({ agentId: step.agent.agentId, instruction: step.instruction, output });
        carry = output;
        await this.db
          .update(workflowRuns)
          .set({ results })
          .where(eq(workflowRuns.id, runId));
      }
      await this.db
        .update(workflowRuns)
        .set({ status: 'DONE', results })
        .where(eq(workflowRuns.id, runId));
      this.logger.log(`workflow ${run.workflowId} run ${runId} done (${results.length} steps)`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await this.db
        .update(workflowRuns)
        .set({ status: 'FAILED', error: detail, results })
        .where(eq(workflowRuns.id, runId));
      this.logger.error(`workflow run ${runId} failed: ${detail}`);
    }
  }

  /** The core loop, shared by agent runs and workflow steps. */
  private async runLoop(
    run: Pick<
      AgentRun,
      'agentId' | 'agentName' | 'model' | 'tools' | 'projectId' | 'instruction'
    >,
  ): Promise<{ output: string; trace: ToolTraceEntry[] }> {
    const context: AgentToolContext = {
      projectId: run.projectId,
      agentId: run.agentId,
    };
    const available = this.tools.select(run.tools);
    const trace: ToolTraceEntry[] = [];

    // Offline path: prove the plumbing without a model — one retrieval, done.
    if (this.config.get<string>('AI_PROVIDER', 'stub').toLowerCase() !== 'gemini') {
      const search = this.tools.find('search_knowledge');
      let found = 'knowledge tool unavailable';
      if (search && available.some((t) => t.name === 'search_knowledge')) {
        found = await search.execute(context, { query: run.instruction });
        trace.push({
          tool: 'search_knowledge',
          args: { query: run.instruction },
          result: found.slice(0, 500),
        });
      }
      return {
        output: `[stub agent ${run.agentName}] Instruction: "${run.instruction}". Project history consulted:\n${found}`,
        trace,
      };
    }

    const apiKey = this.config.getOrThrow<string>('GEMINI_API_KEY');
    const client = new GoogleGenAI({ apiKey });
    // Manifest model is "provider/model"; only the gemini half is honored.
    const model = run.model.startsWith('gemini/')
      ? run.model.slice('gemini/'.length)
      : this.config.get<string>('GEMINI_MODEL', 'gemini-flash-latest');

    const functionDeclarations = available.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));

    const contents: Content[] = [
      {
        role: 'user',
        parts: [
          {
            text:
              `You are "${run.agentName}", an agent for a software agency, working on one client project. ` +
              `Use the available tools to inspect the project and, when the instruction asks for it, to create todos or record decisions. ` +
              `Only state facts you found via tools. Finish with a concise report of what you found and did.\n\n` +
              `INSTRUCTION: ${run.instruction}`,
          },
        ],
      },
    ];

    const maxTurns = Number(
      this.config.get('AGENT_MAX_TURNS', String(DEFAULT_MAX_TURNS)),
    );
    for (let turn = 0; turn < maxTurns; turn++) {
      const response = await this.generateWithQuotaRetry(() =>
        client.models.generateContent({
          model,
          contents,
          config: {
            tools: [{ functionDeclarations }],
            temperature: 0.2,
          },
        }),
      );

      const calls = response.functionCalls ?? [];
      if (calls.length === 0) {
        return { output: response.text?.trim() || '(no output)', trace };
      }

      const modelContent = response.candidates?.[0]?.content;
      if (modelContent) contents.push(modelContent);

      const responseParts = [];
      for (const call of calls) {
        const tool = available.find((t) => t.name === call.name);
        const args = (call.args ?? {}) as Record<string, unknown>;
        let result: string;
        try {
          result = tool
            ? await tool.execute(context, args)
            : `Unknown tool "${call.name}".`;
        } catch (error) {
          result = `Tool failed: ${error instanceof Error ? error.message : String(error)}`;
        }
        trace.push({ tool: call.name ?? 'unknown', args, result: result.slice(0, 1000) });
        responseParts.push({
          functionResponse: { name: call.name, response: { result } },
        });
      }
      contents.push({ role: 'user', parts: responseParts });
    }

    // Turn budget exhausted: force a final answer with tools disabled so the
    // run still ends in a useful report instead of a dead stop.
    contents.push({
      role: 'user',
      parts: [
        {
          text: 'Stop using tools now. Summarize concisely what you found, what you did, and anything you could not finish.',
        },
      ],
    });
    const final = await this.generateWithQuotaRetry(() =>
      client.models.generateContent({
        model,
        contents,
        config: { temperature: 0.2 },
      }),
    );
    return {
      output:
        final.text?.trim() ||
        `(stopped after ${maxTurns} tool turns — partial work is in the trace)`,
      trace,
    };
  }

  /**
   * Free-tier Gemini caps requests per minute; an agent loop burns one per
   * turn. On 429, wait out the API's suggested retryDelay (capped) instead
   * of failing the whole run.
   */
  private async generateWithQuotaRetry<T>(
    fn: () => Promise<T>,
    attempts = 4,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('429') && !message.includes('RESOURCE_EXHAUSTED')) {
          throw error;
        }
        if (attempt === attempts) break;
        const suggested = /retry in ([0-9.]+)s/i.exec(message)?.[1];
        const waitMs = Math.min(
          suggested ? Math.ceil(Number(suggested) * 1000) + 1000 : 30_000,
          65_000,
        );
        this.logger.warn(
          `Gemini quota hit (attempt ${attempt}/${attempts}) — waiting ${Math.round(waitMs / 1000)}s`,
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
    throw lastError;
  }
}
