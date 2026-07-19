import { Logger } from '@nestjs/common';

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
}

interface EmbeddingResponse {
  data?: { embedding?: number[] }[];
}

/**
 * A client for any OpenAI-compatible API — OpenAI itself, LiteLLM proxies,
 * and Ollama's /v1 endpoint. One chat surface + one embeddings surface, both
 * the standard OpenAI shapes. Satisfies ChatJsonClient so the shared HF
 * draft/answer adapters work against all of them unchanged.
 */
export class OpenAiCompatibleClient {
  private readonly logger = new Logger(OpenAiCompatibleClient.name);
  private readonly base: string;

  constructor(
    baseUrl: string,
    private readonly apiKey: string,
    private readonly label = 'OpenAI-compatible',
  ) {
    this.base = baseUrl.replace(/\/$/, '');
  }

  async chat(model: string, prompt: string, temperature = 0.2): Promise<string> {
    const response = await this.withRetries(async () => {
      const res = await fetch(`${this.base}/chat/completions`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature,
          max_tokens: 2048,
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`${this.label} chat failed (HTTP ${res.status}): ${detail.slice(0, 300)}`);
      }
      return (await res.json()) as ChatResponse;
    });
    const content = response.choices?.[0]?.message?.content;
    if (!content) throw new Error(`${this.label} returned an empty response.`);
    return content;
  }

  /** Not every model honors JSON mode — extract the first JSON object. */
  parseJson<T>(raw: string): T {
    const cleaned = raw.replace(/```(?:json)?/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error(`${this.label} response contained no JSON object.`);
    }
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  }

  async embed(
    model: string,
    texts: string[],
    dimensions?: number,
  ): Promise<number[][]> {
    if (texts.length === 0) return [];
    const response = await this.withRetries(async () => {
      const res = await fetch(`${this.base}/embeddings`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          model,
          input: texts,
          // OpenAI's v3 embeddings honor a requested dimension; harmless for
          // providers that ignore it (we still validate the result length).
          ...(dimensions ? { dimensions } : {}),
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`${this.label} embed failed (HTTP ${res.status}): ${detail.slice(0, 300)}`);
      }
      return (await res.json()) as EmbeddingResponse;
    });
    const vectors = (response.data ?? []).map((d) => d.embedding ?? []);
    if (vectors.length !== texts.length) {
      throw new Error(
        `${this.label} returned ${vectors.length} embeddings for ${texts.length} texts.`,
      );
    }
    return vectors;
  }

  private headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.apiKey}`,
      'content-type': 'application/json',
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
          `${this.label} call failed (attempt ${attempt}/${attempts}): ${
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
