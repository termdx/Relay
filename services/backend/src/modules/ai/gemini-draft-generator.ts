import { Logger } from '@nestjs/common';
import { GoogleGenAI, Type } from '@google/genai';
import type { DraftGenerator, DraftResult } from './draft-generator';

const SYSTEM_PROMPT = `You are an assistant for a software agency. You are given the transcript of a client meeting.

Produce:
1. "summary": a concise, client-ready summary of what was discussed and decided (2-5 sentences, plain professional English).
2. "tasks": a list of concrete next-step action items that were actually agreed. For each task include a short "title", a one-line "body", and, if a specific owner was named in the meeting, their name as "assignee".

Only include tasks that represent real, agreed action items — do not invent work. If nothing actionable was agreed, return an empty tasks array.`;

/** Structured-output schema so Gemini returns parseable JSON, not prose. */
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    tasks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          body: { type: Type.STRING },
          assignee: { type: Type.STRING },
        },
        required: ['title', 'body'],
      },
    },
  },
  required: ['summary', 'tasks'],
};

interface GeminiDraftShape {
  summary?: string;
  tasks?: { title?: string; body?: string; assignee?: string }[];
}

/**
 * Real DraftGenerator backed by Google Gemini. Implements the same seam as the
 * stub — selected via AI_PROVIDER=gemini — so no consumer changes.
 */
export class GeminiDraftGenerator implements DraftGenerator {
  private readonly logger = new Logger(GeminiDraftGenerator.name);
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async generateDraft(transcript: string): Promise<DraftResult> {
    const response = await this.withRetries(() =>
      this.client.models.generateContent({
        model: this.model,
        contents: `${SYSTEM_PROMPT}\n\nTRANSCRIPT:\n${transcript}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.2,
        },
      }),
    );

    const text = response.text;
    if (!text) {
      throw new Error('Gemini returned an empty response.');
    }

    let parsed: GeminiDraftShape;
    try {
      parsed = JSON.parse(text) as GeminiDraftShape;
    } catch {
      throw new Error('Gemini response was not valid JSON.');
    }

    return {
      summary: parsed.summary?.trim() ?? '',
      tasks: (parsed.tasks ?? [])
        .filter((task): task is { title: string; body?: string; assignee?: string } =>
          typeof task?.title === 'string' && task.title.trim().length > 0,
        )
        .map((task) => ({
          title: task.title.trim(),
          body: task.body?.trim() ?? '',
          assignee: task.assignee?.trim() ? task.assignee.trim() : undefined,
        })),
    };
  }

  /** Retry transient failures — external integration per CLAUDE.md. */
  private async withRetries<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `Gemini call failed (attempt ${attempt}/${attempts}): ${
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
