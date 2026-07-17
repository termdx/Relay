import type { AiProviderManifest } from '../schemas/ai-provider';

export interface ProviderHealth {
  id: string;
  status: 'ok' | 'error' | 'unknown';
  detail?: string;
  models?: string[];
}

interface GeminiModelsResponse {
  models?: { name?: string }[];
}
interface OllamaTagsResponse {
  models?: { name?: string }[];
}

/**
 * Live provider probe using plain fetch — the kernel stays free of provider
 * SDKs. Returns discovered models where the provider exposes them.
 */
export async function probeProvider(
  manifest: AiProviderManifest,
  apiKey: string | undefined,
): Promise<ProviderHealth> {
  try {
    switch (manifest.provider) {
      case 'gemini': {
        if (!apiKey) {
          return { id: manifest.id, status: 'error', detail: 'no API key configured' };
        }
        const res = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models',
          { headers: { 'x-goog-api-key': apiKey } },
        );
        if (!res.ok) {
          return { id: manifest.id, status: 'error', detail: `HTTP ${res.status}` };
        }
        const data = (await res.json()) as GeminiModelsResponse;
        const models = (data.models ?? [])
          .map((m) => m.name?.replace(/^models\//, ''))
          .filter((n): n is string => Boolean(n));
        return { id: manifest.id, status: 'ok', models };
      }
      case 'ollama': {
        const base = manifest.endpoint ?? 'http://localhost:11434';
        const res = await fetch(`${base}/api/tags`);
        if (!res.ok) {
          return { id: manifest.id, status: 'error', detail: `HTTP ${res.status}` };
        }
        const data = (await res.json()) as OllamaTagsResponse;
        const models = (data.models ?? [])
          .map((m) => m.name)
          .filter((n): n is string => Boolean(n));
        return { id: manifest.id, status: 'ok', models };
      }
      default:
        return {
          id: manifest.id,
          status: 'unknown',
          detail: `health probe not implemented for ${manifest.provider}`,
        };
    }
  } catch (error) {
    return {
      id: manifest.id,
      status: 'error',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
