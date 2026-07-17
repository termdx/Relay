import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EnvFileSecrets } from './env-file-secrets';

describe('EnvFileSecrets', () => {
  let dir: string;
  let secrets: EnvFileSecrets;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'relay-secrets-'));
    secrets = new EnvFileSecrets(join(dir, 'master.key'), join(dir, 'secrets.enc'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('round-trips set/get/list/delete', async () => {
    expect(await secrets.list()).toEqual([]);
    await secrets.set('gemini.apiKey', 'AIza-super-secret');
    await secrets.set('github.pat', 'ghp_token');
    expect(await secrets.get('gemini.apiKey')).toBe('AIza-super-secret');
    expect(await secrets.list()).toEqual(['gemini.apiKey', 'github.pat']);
    await secrets.delete('github.pat');
    expect(await secrets.list()).toEqual(['gemini.apiKey']);
  });

  it('stores the value encrypted, not in plaintext', async () => {
    await secrets.set('gemini.apiKey', 'AIza-super-secret');
    const blob = await readFile(join(dir, 'secrets.enc'), 'utf8');
    expect(blob).not.toContain('AIza-super-secret');
  });
});
