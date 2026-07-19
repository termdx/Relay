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

interface OpenAiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
}

interface OpenAiToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: unknown;
  };
}

/**
 * Gemini tool schemas are authored with its Type enum, which serializes
 * uppercase ("OBJECT", "STRING"). OpenAI-compatible APIs (OpenRouter) want
 * lowercase JSON Schema types — lowercase every `type` string, recursively.
 */
function toJsonSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toJsonSchema);
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      out[key] =
        key === 'type' && typeof value === 'string'
          ? value.toLowerCase()
          : toJsonSchema(value);
    }
    return out;
  }
  return node;
}

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

    // Route by the agent's chosen model, not the global chat provider.
    // openrouter/* runs OpenAI-style tool calling; gemini/* uses Gemini's
    // native function calling. Either path is real function calling.
    if (run.model.startsWith('openrouter/')) {
      const orKey = this.config.get<string>('OPENROUTER_API_KEY');
      if (!orKey) {
        throw new Error(
          'This agent uses an OpenRouter model, but no OpenRouter provider is connected. Add one in Runtime → AI providers.',
        );
      }
      return this.runOpenRouterLoop(
        run,
        context,
        available,
        trace,
        run.model.slice('openrouter/'.length),
        orKey,
      );
    }

    const aiProvider = this.config
      .get<string>('AI_PROVIDER', 'stub')
      .toLowerCase();
    // Agents run on Gemini's native function calling. The active provider
    // (OpenRouter/HF) may serve chat & drafts, but as long as a Gemini key
    // is installed, agents keep working.
    const hasGeminiKey = Boolean(this.config.get<string>('GEMINI_API_KEY'));
    if (!hasGeminiKey && (aiProvider === 'huggingface' || aiProvider === 'openrouter')) {
      // Honest failure beats a silent stub: agent runs need reliable
      // function calling, which the chat-only adapters don't provide.
      throw new Error(
        'Agent runs currently require a Gemini provider (function calling). ' +
          `${aiProvider === 'openrouter' ? 'OpenRouter' : 'Hugging Face'} powers drafts and chat — add a Gemini provider to run agents.`,
      );
    }
    // Offline path: prove the plumbing without a model — one retrieval, done.
    if (aiProvider !== 'gemini' && !hasGeminiKey) {
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
              `Only state facts you found via tools. ` +
              `CRITICAL: if a tool result starts with "ERROR:" or reports something unavailable, that action DID NOT HAPPEN — you must say so plainly in your report and never claim it succeeded. ` +
              `Finish with a concise report of what you found and did.\n\n` +
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
   * OpenAI-style tool-calling loop against OpenRouter — the same agent
   * contract as the Gemini path, so any tool-capable model OpenRouter serves
   * can drive an agent. Reuses generateWithQuotaRetry for 429 backoff.
   */
  private async runOpenRouterLoop(
    run: Pick<AgentRun, 'agentName' | 'tools' | 'instruction'>,
    context: AgentToolContext,
    available: ReturnType<AgentToolsService['select']>,
    trace: ToolTraceEntry[],
    model: string,
    apiKey: string,
  ): Promise<{ output: string; trace: ToolTraceEntry[] }> {
    const tools = available.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        // Gemini's Type enum serializes uppercase (OBJECT/STRING); OpenAI
        // tool schemas need lowercase JSON Schema types.
        parameters: toJsonSchema(tool.parameters),
      },
    }));

    const messages: OpenAiMessage[] = [
      {
        role: 'system',
        content:
          `You are "${run.agentName}", an agent for a software agency, working on one client project. ` +
          `Use the available tools to inspect the project and, when the instruction asks for it, to create todos or record decisions. ` +
          `Only state facts you found via tools. ` +
          `CRITICAL: if a tool result starts with "ERROR:" or reports something unavailable, that action DID NOT HAPPEN — say so plainly and never claim it succeeded. ` +
          `Finish with a concise report of what you found and did.`,
      },
      { role: 'user', content: `INSTRUCTION: ${run.instruction}` },
    ];

    const maxTurns = Number(
      this.config.get('AGENT_MAX_TURNS', String(DEFAULT_MAX_TURNS)),
    );
    for (let turn = 0; turn < maxTurns; turn++) {
      const message = await this.generateWithQuotaRetry(() =>
        this.openRouterChat(apiKey, model, messages, tools),
      );
      const calls = message.tool_calls ?? [];
      if (calls.length === 0) {
        return { output: message.content?.trim() || '(no output)', trace };
      }
      messages.push({
        role: 'assistant',
        content: message.content ?? '',
        tool_calls: calls,
      });
      for (const call of calls) {
        const tool = available.find((t) => t.name === call.function.name);
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || '{}') as Record<
            string,
            unknown
          >;
        } catch {
          /* malformed args → run the tool with none */
        }
        let result: string;
        try {
          result = tool
            ? await tool.execute(context, args)
            : `Unknown tool "${call.function.name}".`;
        } catch (error) {
          result = `Tool failed: ${error instanceof Error ? error.message : String(error)}`;
        }
        trace.push({
          tool: call.function.name,
          args,
          result: result.slice(0, 1000),
        });
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: result,
        });
      }
    }

    messages.push({
      role: 'user',
      content:
        'Stop using tools now. Summarize concisely what you found, what you did, and anything you could not finish.',
    });
    const final = await this.generateWithQuotaRetry(() =>
      this.openRouterChat(apiKey, model, messages, undefined),
    );
    return {
      output:
        final.content?.trim() ||
        `(stopped after ${maxTurns} tool turns — partial work is in the trace)`,
      trace,
    };
  }

  /** One OpenRouter chat-completions call, returning the assistant message. */
  private async openRouterChat(
    apiKey: string,
    model: string,
    messages: OpenAiMessage[],
    tools: OpenAiToolDef[] | undefined,
  ): Promise<OpenAiMessage> {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'HTTP-Referer': 'https://github.com/termdx/Relay',
        'X-Title': 'Relay',
      },
      body: JSON.stringify({
        model,
        messages,
        ...(tools ? { tools } : {}),
        temperature: 0.2,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(
        `OpenRouter chat failed (HTTP ${res.status}): ${detail.slice(0, 300)}`,
      );
    }
    const data = (await res.json()) as {
      choices?: { message?: OpenAiMessage }[];
    };
    const message = data.choices?.[0]?.message;
    if (!message) throw new Error('OpenRouter returned no message.');
    return message;
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
