import { describe, expect, it } from 'vitest';
import { aiProviderManifestSchema } from '../schemas/ai-provider';
import { integrationManifestSchema } from '../schemas/integration';
import { moduleManifestSchema, type ModuleManifest } from '../schemas/module';
import { validateWorkspace, type ValidationInput } from './validator';

function mod(raw: Partial<ModuleManifest> & { id: string }): ModuleManifest {
  return moduleManifestSchema.parse({ version: '0.1.0', ...raw });
}

const base: ValidationInput = {
  modules: [],
  integrations: [],
  aiProviders: [],
  secretRefs: [],
};

function codes(input: ValidationInput): string[] {
  return validateWorkspace(input).map((d) => d.code);
}

describe('validateWorkspace', () => {
  it('passes a coherent workspace', () => {
    const input: ValidationInput = {
      ...base,
      modules: [mod({ id: 'projects' }), mod({ id: 'timeline', dependencies: ['projects'] })],
    };
    expect(validateWorkspace(input)).toEqual([]);
  });

  it('flags a missing dependency', () => {
    expect(codes({ ...base, modules: [mod({ id: 'timeline', dependencies: ['projects'] })] })).toContain(
      'MISSING_DEPENDENCY',
    );
  });

  it('flags missing integration, capability and secret', () => {
    const input: ValidationInput = {
      ...base,
      modules: [
        mod({
          id: 'meeting',
          requiredIntegrations: ['github'],
          requiredAiCapabilities: ['draft'],
        }),
      ],
      integrations: [
        integrationManifestSchema.parse({
          id: 'github',
          version: '0.1.0',
          credentials: [{ name: 'token', secretRef: 'github.token', required: true }],
        }),
      ],
    };
    const found = codes(input);
    expect(found).toContain('MISSING_AI_CAPABILITY');
    expect(found).toContain('MISSING_SECRET');
    // github IS installed, so no MISSING_INTEGRATION
    expect(found).not.toContain('MISSING_INTEGRATION');
  });

  it('is satisfied once the provider capability and secret exist', () => {
    const input: ValidationInput = {
      ...base,
      modules: [mod({ id: 'meeting', requiredAiCapabilities: ['draft'] })],
      aiProviders: [
        aiProviderManifestSchema.parse({
          id: 'gemini',
          version: '0.1.0',
          provider: 'gemini',
          capabilities: ['draft'],
        }),
      ],
    };
    expect(validateWorkspace(input)).toEqual([]);
  });

  it('flags host-port conflicts across modules', () => {
    const input: ValidationInput = {
      ...base,
      modules: [
        mod({ id: 'a', services: [{ name: 'x', image: 'nginx', ports: ['8080:80'] }] }),
        mod({ id: 'b', services: [{ name: 'y', image: 'nginx', ports: ['8080:81'] }] }),
      ],
    };
    expect(codes(input)).toContain('PORT_CONFLICT');
  });
});
