import type { Answerer, ContextChunk, GroundedAnswer } from './answerer';
import type { DraftGenerator, DraftResult } from './draft-generator';
import { EMBEDDING_DIMENSIONS, type Embedder } from './embedder';
import { HfClient } from './hf-client';

/**
 * Any OpenAI-compatible prompt-in/JSON-out chat client (HF router,
 * OpenRouter). The draft/answer adapters only need this surface, so they
 * serve every such provider unchanged.
 */
export interface ChatJsonClient {
  chat(model: string, prompt: string, temperature?: number): Promise<string>;
  parseJson<T>(raw: string): T;
}

/** OpenAI-compatible DraftGenerator — same seam as Gemini/stub. */
export class HfDraftGenerator implements DraftGenerator {
  constructor(
    private readonly client: ChatJsonClient,
    private readonly model: string,
  ) {}

  async generateDraft(transcript: string): Promise<DraftResult> {
    const raw = await this.client.chat(
      this.model,
      `You are an assistant for a software agency, given a client meeting transcript.

Return ONLY a JSON object (no prose, no code fences) shaped exactly:
{"summary": "<2-5 sentence client-ready summary>", "tasks": [{"title": "...", "body": "...", "assignee": "..."}]}

Only include tasks that are real agreed action items; omit "assignee" when nobody was named. If nothing actionable was agreed, "tasks" is [].

TRANSCRIPT:
${transcript}`,
    );
    const parsed = this.client.parseJson<{
      summary?: string;
      tasks?: { title?: string; body?: string; assignee?: string }[];
    }>(raw);
    return {
      summary: parsed.summary?.trim() ?? '',
      tasks: (parsed.tasks ?? [])
        .filter(
          (task): task is { title: string; body?: string; assignee?: string } =>
            typeof task?.title === 'string' && task.title.trim().length > 0,
        )
        .map((task) => ({
          title: task.title.trim(),
          body: task.body?.trim() ?? '',
          assignee: task.assignee?.trim() ? task.assignee.trim() : undefined,
        })),
    };
  }
}

/** OpenAI-compatible Answerer — grounded Q&A, same contract as Gemini/stub. */
export class HfAnswerer implements Answerer {
  constructor(
    private readonly client: ChatJsonClient,
    private readonly model: string,
  ) {}

  async answer(question: string, context: ContextChunk[]): Promise<GroundedAnswer> {
    const contextBlock = context.map((c) => `[${c.ref}] ${c.text}`).join('\n');
    const raw = await this.client.chat(
      this.model,
      `You answer questions about a client project using ONLY the numbered CONTEXT entries below. If the context doesn't contain the answer, say the project history doesn't cover it — never invent facts. Cite entries inline like [1].

Return ONLY a JSON object (no prose, no code fences) shaped exactly:
{"answer": "<concise answer with [n] citations>", "citedRefs": [1, 2]}

CONTEXT:
${contextBlock || '(no context found)'}

QUESTION: ${question}`,
      0.1,
    );
    const parsed = this.client.parseJson<{ answer?: string; citedRefs?: number[] }>(raw);
    return {
      answer: parsed.answer?.trim() ?? '',
      citedRefs: (parsed.citedRefs ?? []).filter(
        (ref) => Number.isInteger(ref) && ref >= 1 && ref <= context.length,
      ),
    };
  }
}

/** Hugging Face Embedder — sentence-transformers pipeline, 768-dim enforced. */
export class HfEmbedder implements Embedder {
  constructor(
    private readonly client: HfClient,
    private readonly model: string,
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    const vectors = await this.client.embed(this.model, texts);
    for (const vector of vectors) {
      if (vector.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `HF embed model "${this.model}" returned ${vector.length} dims; the knowledge base needs ${EMBEDDING_DIMENSIONS} (use a 768-dim model like sentence-transformers/all-mpnet-base-v2).`,
        );
      }
    }
    return vectors;
  }
}
