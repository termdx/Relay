import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AlreadyExistsError, NotFoundError } from '../errors';
import { aiProviderManifestSchema, type AiProviderManifest } from '../schemas/ai-provider';
import { ManifestStore } from './manifest-store';

describe('ManifestStore', () => {
  let dir: string;
  let store: ManifestStore<AiProviderManifest>;

  const gemini: AiProviderManifest = aiProviderManifestSchema.parse({
    id: 'gemini',
    version: '0.1.0',
    provider: 'gemini',
    apiKeyRef: 'gemini.apiKey',
    models: ['gemini-2.5-flash'],
  });

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'relay-store-'));
    store = new ManifestStore(dir, aiProviderManifestSchema, 'ai-provider');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('creates, reads, lists and removes manifests', async () => {
    expect(await store.list()).toEqual([]);
    await store.create(gemini);
    expect(await store.list()).toEqual(['gemini']);
    expect((await store.read('gemini')).provider).toBe('gemini');
    await store.remove('gemini');
    expect(await store.list()).toEqual([]);
  });

  it('rejects duplicate create and missing read/remove', async () => {
    await store.create(gemini);
    await expect(store.create(gemini)).rejects.toBeInstanceOf(AlreadyExistsError);
    await expect(store.read('nope')).rejects.toBeInstanceOf(NotFoundError);
    await expect(store.remove('nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('never writes a secret value into the manifest file (only refs)', async () => {
    await store.create(gemini);
    const onDisk = await readFile(join(dir, 'gemini.yaml'), 'utf8');
    expect(onDisk).toContain('apiKeyRef: gemini.apiKey');
    expect(onDisk).not.toContain('AIza');
  });
});
