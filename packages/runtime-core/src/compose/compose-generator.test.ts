import { describe, expect, it } from 'vitest';
import { MODULE_CATALOG } from '../catalog/catalog';
import { aiProviderManifestSchema } from '../schemas/ai-provider';
import { relayConfigSchema } from '../schemas/relay';
import {
  aiProviderEnv,
  buildComposeFile,
  defaultProvider,
  serializeCompose,
} from './compose-generator';

const config = relayConfigSchema.parse({ organization: { name: 'Acme' } });
const projects = MODULE_CATALOG.projects!;

describe('buildComposeFile', () => {
  it('adds postgres + module services on the network, with a volume', () => {
    const compose = buildComposeFile(config, [projects]);
    expect(Object.keys(compose.services).sort()).toEqual(['backend', 'postgres']);
    expect(compose.services.postgres?.image).toBe('postgres:16-alpine');
    expect(compose.services.backend?.depends_on).toContain('postgres');
    expect(compose.networks).toHaveProperty('relay');
    expect(compose.volumes).toHaveProperty('relay_pgdata');
  });

  it('omits postgres when no module needs storage', () => {
    const timeline = MODULE_CATALOG.timeline!;
    const compose = buildComposeFile(config, [timeline]);
    expect(compose.services).not.toHaveProperty('postgres');
    expect(compose.volumes).toBeUndefined();
  });

  it('is deterministic', () => {
    expect(serializeCompose(buildComposeFile(config, [projects]))).toBe(
      serializeCompose(buildComposeFile(config, [projects])),
    );
  });
});

describe('aiProviderEnv', () => {
  it('maps a gemini provider to backend env', () => {
    const gemini = aiProviderManifestSchema.parse({
      id: 'gemini',
      version: '0.1.0',
      provider: 'gemini',
      defaultModel: 'gemini-2.5-flash',
    });
    expect(aiProviderEnv(gemini, 'AIza-key')).toEqual({
      AI_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'AIza-key',
      GEMINI_MODEL: 'gemini-2.5-flash',
    });
  });

  it('falls back to the stub provider when none installed', () => {
    expect(aiProviderEnv(undefined, undefined)).toEqual({ AI_PROVIDER: 'stub' });
    expect(defaultProvider([])).toBeUndefined();
  });
});
