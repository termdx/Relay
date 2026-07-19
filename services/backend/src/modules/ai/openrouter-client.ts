import { Logger } from '@nestjs/common';

const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

interface OrChatResponse {
  choices?: { message?: { content?: string } }[];
}

/**
 * Minimal OpenRouter client (plain fetch, no SDK): one OpenAI-compatible
 * chat endpoint fronting every model OpenRouter serves. Satisfies the
 * ChatJsonClient seam, so the HF draft/answer adapters work unchanged.
 * OpenRouter has no embeddings endpoint — pair with Gemini/HF for those.
 */
export class OpenRouterClient {
  private readonly logger = new Logger(OpenRouterClient.name);

  constructor(private readonly apiKey: string) {}

  async chat(model: string, prompt: string, temperature = 0.2): Promise<string> {
    const response = await this.withRetries(async () => {
      const res = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
          // Attribution headers OpenRouter asks apps to send.
          'HTTP-Referer': 'https://github.com/termdx/Relay',
          'X-Title': 'Relay',
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
        throw new Error(
          `OpenRouter chat failed (HTTP ${res.status}): ${detail.slice(0, 300)}`,
        );
      }
      return (await res.json()) as OrChatResponse;
    });
    const content = response.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenRouter returned an empty response.');
    return content;
  }

  /**
   * Not every routed model honors structured-output modes — demand pure JSON
   * in the prompt and extract the first JSON object defensively.
   */
  parseJson<T>(raw: string): T {
    const cleaned = raw.replace(/```(?:json)?/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('OpenRouter response contained no JSON object.');
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
          `OpenRouter call failed (attempt ${attempt}/${attempts}): ${
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
