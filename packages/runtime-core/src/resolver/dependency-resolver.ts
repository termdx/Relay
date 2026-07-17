import {
  CircularDependencyError,
  UnknownCatalogItemError,
} from '../errors';
import type { ModuleManifest } from '../schemas/module';

export interface ResolveState {
  installedModules: string[];
  installedIntegrations: string[];
  installedAiCapabilities: string[];
}

export interface InstallPlan {
  target: string;
  /** Modules to install (dependencies first), not-yet-installed only. */
  order: string[];
  alreadyInstalled: string[];
  missingIntegrations: string[];
  missingAiCapabilities: string[];
}

/**
 * Resolves a module's full dependency closure against the catalog and the
 * currently installed state. Detects unknown and circular dependencies, and
 * reports required integrations / AI capabilities that are not yet satisfied.
 */
export class DependencyResolver {
  constructor(private readonly catalog: Record<string, ModuleManifest>) {}

  plan(target: string, state: ResolveState): InstallPlan {
    if (!this.catalog[target]) {
      throw new UnknownCatalogItemError('module', target);
    }

    const order: string[] = [];
    const visiting = new Set<string>();
    const done = new Set<string>();

    const visit = (id: string, stack: string[]): void => {
      if (done.has(id)) return;
      if (visiting.has(id)) {
        throw new CircularDependencyError([...stack, id]);
      }
      const module = this.catalog[id];
      if (!module) {
        throw new UnknownCatalogItemError('module', id);
      }
      visiting.add(id);
      for (const dep of module.dependencies) {
        visit(dep, [...stack, id]);
      }
      visiting.delete(id);
      done.add(id);
      order.push(id); // post-order → dependencies precede dependents
    };
    visit(target, []);

    const installed = new Set(state.installedModules);
    const toInstall = order.filter((id) => !installed.has(id));
    const alreadyInstalled = order.filter((id) => installed.has(id));

    const requiredIntegrations = new Set<string>();
    const requiredCapabilities = new Set<string>();
    for (const id of toInstall) {
      const module = this.catalog[id];
      if (!module) continue;
      module.requiredIntegrations.forEach((i) => requiredIntegrations.add(i));
      module.requiredAiCapabilities.forEach((c) => requiredCapabilities.add(c));
    }

    return {
      target,
      order: toInstall,
      alreadyInstalled,
      missingIntegrations: [...requiredIntegrations].filter(
        (i) => !state.installedIntegrations.includes(i),
      ),
      missingAiCapabilities: [...requiredCapabilities].filter(
        (c) => !state.installedAiCapabilities.includes(c),
      ),
    };
  }
}
