import { Logger } from '@nestjs/common';

interface AnthropicResponse {
  content?: { type?: string; text?: string }[];
}

/**
 * Minimal Anthropic Messages API client (plain fetch, no SDK). Anthropic
 * isn't OpenAI-shaped (its own endpoint, x-api-key header, top-level system),
 * so it gets its own client — but it still satisfies ChatJsonClient, so the
 * shared HF draft/answer adapters drive it. No embeddings endpoint: pair
 * Anthropic with Gemini/HF/OpenAI for the knowledge index.
 */
export class AnthropicClient {
  private readonly logger = new Logger(AnthropicClient.name);

  constructor(private readonly apiKey: string) {}

  async chat(model: string, prompt: string, temperature = 0.2): Promise<string> {
    const response = await this.withRetries(async () => {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          temperature,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Anthropic chat failed (HTTP ${res.status}): ${detail.slice(0, 300)}`);
      }
      return (await res.json()) as AnthropicResponse;
    });
    const text = (response.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('')
      .trim();
    if (!text) throw new Error('Anthropic returned an empty response.');
    return text;
  }

  parseJson<T>(raw: string): T {
    const cleaned = raw.replace(/```(?:json)?/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('Anthropic response contained no JSON object.');
    }
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  }

  private async withRetries<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `Anthropic call failed (attempt ${attempt}/${attempts}): ${
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
