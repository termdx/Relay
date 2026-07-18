import { Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { EMBEDDING_DIMENSIONS, type Embedder } from './embedder';

/** Gemini embeddings. Same seam as the stub — selected via AI_PROVIDER. */
export class GeminiEmbedder implements Embedder {
  private readonly logger = new Logger(GeminiEmbedder.name);
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const response = await this.withRetries(() =>
      this.client.models.embedContent({
        model: this.model,
        contents: texts,
        config: { outputDimensionality: EMBEDDING_DIMENSIONS },
      }),
    );
    const embeddings = response.embeddings ?? [];
    if (embeddings.length !== texts.length) {
      throw new Error(
        `Gemini returned ${embeddings.length} embeddings for ${texts.length} texts.`,
      );
    }
    return embeddings.map((e) => e.values ?? []);
  }

  private async withRetries<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `Gemini embed failed (attempt ${attempt}/${attempts}): ${
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
