import { Logger } from '@nestjs/common';

const CHAT_URL = 'https://router.huggingface.co/v1/chat/completions';

interface HfChatResponse {
  choices?: { message?: { content?: string } }[];
}

/**
 * Minimal Hugging Face Inference client (plain fetch, no SDK): the router's
 * OpenAI-compatible chat endpoint + the feature-extraction pipeline for
 * embeddings. Shared by the HF adapters.
 */
export class HfClient {
  private readonly logger = new Logger(HfClient.name);

  constructor(private readonly token: string) {}

  async chat(model: string, prompt: string, temperature = 0.2): Promise<string> {
    const response = await this.withRetries(async () => {
      const res = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature,
          max_tokens: 2048,
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`HF chat failed (HTTP ${res.status}): ${detail.slice(0, 300)}`);
      }
      return (await res.json()) as HfChatResponse;
    });
    const content = response.choices?.[0]?.message?.content;
    if (!content) throw new Error('HF returned an empty response.');
    return content;
  }

  /**
   * Open models don't reliably honor structured-output modes — demand pure
   * JSON in the prompt and extract the first JSON object defensively.
   */
  parseJson<T>(raw: string): T {
    const cleaned = raw.replace(/```(?:json)?/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('HF response contained no JSON object.');
    }
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  }

  async embed(model: string, texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const vectors = await this.withRetries(async () => {
      const res = await fetch(
        `https://router.huggingface.co/hf-inference/models/${model}/pipeline/feature-extraction`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ inputs: texts }),
        },
      );
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`HF embed failed (HTTP ${res.status}): ${detail.slice(0, 300)}`);
      }
      return (await res.json()) as number[][];
    });
    if (!Array.isArray(vectors) || vectors.length !== texts.length) {
      throw new Error(`HF returned ${vectors?.length ?? 0} embeddings for ${texts.length} texts.`);
    }
    return vectors;
  }

  private async withRetries<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `HF call failed (attempt ${attempt}/${attempts}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        if (attempt < attempts) {
          await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
        }
      }
    }
    throw lastError;
  }
}
