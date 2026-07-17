import { describe, expect, it } from 'vitest';
import { CircularDependencyError, UnknownCatalogItemError } from '../errors';
import { moduleManifestSchema, type ModuleManifest } from '../schemas/module';
import { DependencyResolver } from './dependency-resolver';

function mod(raw: Partial<ModuleManifest> & { id: string }): ModuleManifest {
  return moduleManifestSchema.parse({ version: '0.1.0', ...raw });
}

const catalog: Record<string, ModuleManifest> = {
  projects: mod({ id: 'projects' }),
  meeting: mod({
    id: 'meeting',
    dependencies: ['projects'],
    requiredIntegrations: ['github'],
    requiredAiCapabilities: ['draft'],
  }),
};

const empty = {
  installedModules: [],
  installedIntegrations: [],
  installedAiCapabilities: [],
};

describe('DependencyResolver', () => {
  it('orders dependencies before dependents and reports unmet needs', () => {
    const plan = new DependencyResolver(catalog).plan('meeting', empty);
    expect(plan.order).toEqual(['projects', 'meeting']);
    expect(plan.missingIntegrations).toEqual(['github']);
    expect(plan.missingAiCapabilities).toEqual(['draft']);
  });

  it('skips already-installed dependencies', () => {
    const plan = new DependencyResolver(catalog).plan('meeting', {
      ...empty,
      installedModules: ['projects'],
      installedIntegrations: ['github'],
      installedAiCapabilities: ['draft'],
    });
    expect(plan.order).toEqual(['meeting']);
    expect(plan.alreadyInstalled).toEqual(['projects']);
    expect(plan.missingIntegrations).toEqual([]);
  });

  it('detects a circular dependency', () => {
    const cyclic = {
      a: mod({ id: 'a', dependencies: ['b'] }),
      b: mod({ id: 'b', dependencies: ['a'] }),
    };
    expect(() => new DependencyResolver(cyclic).plan('a', empty)).toThrow(
      CircularDependencyError,
    );
  });

  it('rejects an unknown target', () => {
    expect(() => new DependencyResolver(catalog).plan('nope', empty)).toThrow(
      UnknownCatalogItemError,
    );
  });
});
