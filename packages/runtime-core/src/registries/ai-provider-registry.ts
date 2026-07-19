import type { ManifestStore } from '../manifest/manifest-store';
import type { SecretsProvider } from '../secrets/secrets-provider';
import {
  aiProviderManifestSchema,
  type AiProviderManifest,
} from '../schemas/ai-provider';
import { probeProvider, type ProviderHealth } from './provider-health';

export interface AddAiProviderInput {
  provider: string;
  id?: string;
  /** Stored in the secrets provider as a reference — never in the manifest. */
  apiKey?: string;
  endpoint?: string;
  models?: string[];
  defaultModel?: string;
  capabilities?: string[];
}

/**
 * What each known provider's backend adapters actually support. Modules
 * validate their requiredAiCapabilities against these, so an understated
 * list produces false MISSING_AI_CAPABILITY diagnostics.
 */
const DEFAULT_CAPABILITIES: Record<string, string[]> = {
  gemini: ['draft', 'chat', 'embeddings'],
  huggingface: ['draft', 'chat', 'embeddings'],
  // OpenRouter has no embeddings endpoint — pair it with Gemini/HF for those.
  openrouter: ['draft', 'chat'],
};

/**
 * Manages installed AI providers (ai/<id>.yaml). Generalizes the hand-wired
 * AI_PROVIDER/GEMINI_API_KEY seam in services/backend into managed state:
 * the key lands in secrets, the config in a manifest holding only a secret ref.
 */
export class AiProviderRegistry {
  constructor(
    private readonly store: ManifestStore<AiProviderManifest>,
    private readonly secrets: SecretsProvider,
  ) {}

  async add(input: AddAiProviderInput): Promise<AiProviderManifest> {
    const id = input.id ?? input.provider;
    const apiKeyRef = input.apiKey ? `${id}.apiKey` : undefined;

    const manifest = aiProviderManifestSchema.parse({
      id,
      version: '0.1.0',
      provider: input.provider,
      endpoint: input.endpoint,
      apiKeyRef,
      models: input.models ?? [],
      defaultModel: input.defaultModel,
      capabilities: input.capabilities ?? DEFAULT_CAPABILITIES[input.provider] ?? ['draft'],
    });

    // Write the secret first so a manifest never references a missing secret.
    if (input.apiKey && apiKeyRef) {
      await this.secrets.set(apiKeyRef, input.apiKey);
    }
    await this.store.create(manifest);
    return manifest;
  }

  list(): Promise<AiProviderManifest[]> {
    return this.store.readAll();
  }

  info(id: string): Promise<AiProviderManifest> {
    return this.store.read(id);
  }

  async remove(id: string): Promise<void> {
    const manifest = await this.store.read(id);
    if (manifest.apiKeyRef) {
      await this.secrets.delete(manifest.apiKeyRef);
    }
    await this.store.remove(id);
  }

  async resolveApiKey(
    manifest: AiProviderManifest,
  ): Promise<string | undefined> {
    return manifest.apiKeyRef
      ? this.secrets.get(manifest.apiKeyRef)
      : undefined;
  }

  async health(id: string): Promise<ProviderHealth> {
    const manifest = await this.store.read(id);
    return probeProvider(manifest, await this.resolveApiKey(manifest));
  }

  /** Live model list where the provider exposes one; else the manifest list. */
  async models(id: string): Promise<string[]> {
    const manifest = await this.store.read(id);
    const probe = await probeProvider(
      manifest,
      await this.resolveApiKey(manifest),
    );
    return probe.models ?? manifest.models;
  }
}
