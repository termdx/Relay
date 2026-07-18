import { Logger } from '@nestjs/common';
import { GoogleGenAI, Type } from '@google/genai';
import type { Answerer, ContextChunk, GroundedAnswer } from './answerer';

const SYSTEM_PROMPT = `You answer questions about a client project for a software agency.

You are given numbered CONTEXT entries — real, timestamped events from the project's history — and a QUESTION.

Rules:
- Answer ONLY from the context. If the context does not contain the answer, say plainly that the project history doesn't cover it. Never guess or invent project facts.
- Cite the entries you used inline like [1] or [2][3].
- Be concise and concrete: dates, titles, and outcomes over generalities.
- Plain professional English; no preamble.`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    answer: { type: Type.STRING },
    citedRefs: { type: Type.ARRAY, items: { type: Type.INTEGER } },
  },
  required: ['answer', 'citedRefs'],
};

interface GeminiAnswerShape {
  answer?: string;
  citedRefs?: number[];
}

/** Grounded generation via Gemini. Same seam as the stub. */
export class GeminiAnswerer implements Answerer {
  private readonly logger = new Logger(GeminiAnswerer.name);
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async answer(
    question: string,
    context: ContextChunk[],
  ): Promise<GroundedAnswer> {
    const contextBlock = context
      .map((chunk) => `[${chunk.ref}] ${chunk.text}`)
      .join('\n');

    const response = await this.withRetries(() =>
      this.client.models.generateContent({
        model: this.model,
        contents: `${SYSTEM_PROMPT}\n\nCONTEXT:\n${contextBlock || '(no context found)'}\n\nQUESTION: ${question}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.1,
        },
      }),
    );

    const text = response.text;
    if (!text) throw new Error('Gemini returned an empty response.');

    let parsed: GeminiAnswerShape;
    try {
      parsed = JSON.parse(text) as GeminiAnswerShape;
    } catch {
      throw new Error('Gemini response was not valid JSON.');
    }

    return {
      answer: parsed.answer?.trim() ?? '',
      citedRefs: (parsed.citedRefs ?? []).filter(
        (ref) => Number.isInteger(ref) && ref >= 1 && ref <= context.length,
      ),
    };
  }

  private async withRetries<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `Gemini answer failed (attempt ${attempt}/${attempts}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        if (attempt < attempts) {
          await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        }
      }
    }
    throw lastError;
  }
}
