import { describe, expect, it } from 'vitest';
import { aiProviderManifestSchema } from './ai-provider';
import { moduleManifestSchema } from './module';
import { relayConfigSchema } from './relay';
import { secretRefSchema } from './common';

describe('relayConfigSchema', () => {
  it('applies defaults and requires organization', () => {
    const cfg = relayConfigSchema.parse({ organization: { name: 'Acme' } });
    expect(cfg.runtime.mode).toBe('local');
    expect(cfg.network.apiPort).toBe(51720);
    expect(cfg.schemaVersion).toBe('1');
  });

  it('rejects config without an organization', () => {
    expect(relayConfigSchema.safeParse({}).success).toBe(false);
  });
});

describe('moduleManifestSchema', () => {
  it('fills array/object defaults', () => {
    const mod = moduleManifestSchema.parse({ id: 'meeting', version: '0.1.0' });
    expect(mod.dependencies).toEqual([]);
    expect(mod.capabilities.ui).toBe(false);
    expect(mod.kind).toBe('module');
  });

  it('rejects non-kebab-case ids', () => {
    expect(
      moduleManifestSchema.safeParse({ id: 'Meeting_1', version: '0.1.0' })
        .success,
    ).toBe(false);
  });
});

describe('aiProviderManifestSchema', () => {
  it('accepts a gemini provider with a secret reference', () => {
    const p = aiProviderManifestSchema.parse({
      id: 'gemini',
      version: '0.1.0',
      provider: 'gemini',
      apiKeyRef: 'gemini.apiKey',
      models: ['gemini-2.5-flash'],
      defaultModel: 'gemini-2.5-flash',
    });
    expect(p.provider).toBe('gemini');
    expect(p.capabilities).toContain('draft');
  });

  it('rejects an unknown provider', () => {
    expect(
      aiProviderManifestSchema.safeParse({
        id: 'foo',
        version: '0.1.0',
        provider: 'made-up',
      }).success,
    ).toBe(false);
  });
});

describe('secretRefSchema', () => {
  it('accepts namespace.key and rejects bare values', () => {
    expect(secretRefSchema.safeParse('gemini.apiKey').success).toBe(true);
    expect(secretRefSchema.safeParse('sk-plaintext-secret').success).toBe(false);
  });
});
