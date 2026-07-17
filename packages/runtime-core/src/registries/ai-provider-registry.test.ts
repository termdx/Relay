import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ManifestStore } from '../manifest/manifest-store';
import type { SecretsProvider } from '../secrets/secrets-provider';
import { aiProviderManifestSchema } from '../schemas/ai-provider';
import { AiProviderRegistry } from './ai-provider-registry';

class InMemorySecrets implements SecretsProvider {
  private map = new Map<string, string>();
  get(ref: string) {
    return Promise.resolve(this.map.get(ref));
  }
  set(ref: string, value: string) {
    this.map.set(ref, value);
    return Promise.resolve();
  }
  delete(ref: string) {
    this.map.delete(ref);
    return Promise.resolve();
  }
  list() {
    return Promise.resolve([...this.map.keys()].sort());
  }
}

describe('AiProviderRegistry', () => {
  let dir: string;
  let secrets: InMemorySecrets;
  let registry: AiProviderRegistry;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'relay-ai-'));
    secrets = new InMemorySecrets();
    registry = new AiProviderRegistry(
      new ManifestStore(dir, aiProviderManifestSchema, 'ai-provider'),
      secrets,
    );
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('stores the api key in secrets and only a ref in the manifest', async () => {
    const manifest = await registry.add({
      provider: 'gemini',
      apiKey: 'AIza-secret',
      defaultModel: 'gemini-2.5-flash',
    });
    expect(manifest.apiKeyRef).toBe('gemini.apiKey');
    expect(JSON.stringify(manifest)).not.toContain('AIza-secret');
    expect(await secrets.get('gemini.apiKey')).toBe('AIza-secret');
    expect(await registry.resolveApiKey(manifest)).toBe('AIza-secret');
  });

  it('removes the manifest and its secret together', async () => {
    await registry.add({ provider: 'gemini', apiKey: 'AIza-secret' });
    await registry.remove('gemini');
    expect(await registry.list()).toEqual([]);
    expect(await secrets.list()).toEqual([]);
  });

  it('supports keyless local providers (ollama)', async () => {
    const manifest = await registry.add({
      provider: 'ollama',
      endpoint: 'http://localhost:11434',
    });
    expect(manifest.apiKeyRef).toBeUndefined();
    expect(await secrets.list()).toEqual([]);
  });
});
