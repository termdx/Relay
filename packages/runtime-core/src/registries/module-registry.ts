import { HasDependentsError, UnknownCatalogItemError, UnmetDependenciesError } from '../errors';
import type { ManifestStore } from '../manifest/manifest-store';
import {
  DependencyResolver,
  type InstallPlan,
} from '../resolver/dependency-resolver';
import type { ModuleManifest } from '../schemas/module';

export interface ModuleAddContext {
  installedIntegrations: string[];
  installedAiCapabilities: string[];
}

/** Manages installed modules (modules/<id>.yaml) and their dependency graph. */
export class ModuleRegistry {
  private readonly resolver: DependencyResolver;

  constructor(
    private readonly store: ManifestStore<ModuleManifest>,
    private readonly catalog: Record<string, ModuleManifest>,
  ) {
    this.resolver = new DependencyResolver(catalog);
  }

  catalogItems(): ModuleManifest[] {
    return Object.values(this.catalog);
  }

  list(): Promise<ModuleManifest[]> {
    return this.store.readAll();
  }

  info(id: string): Promise<ModuleManifest> {
    return this.store.read(id);
  }

  async plan(id: string, context: ModuleAddContext): Promise<InstallPlan> {
    return this.resolver.plan(id, {
      installedModules: await this.store.list(),
      installedIntegrations: context.installedIntegrations,
      installedAiCapabilities: context.installedAiCapabilities,
    });
  }

  /**
   * Install a module. With `withDependencies`, its missing catalog
   * dependencies are installed first; without, a missing dependency is an
   * error (nothing is written).
   */
  async add(
    id: string,
    context: ModuleAddContext,
    withDependencies: boolean,
  ): Promise<InstallPlan> {
    const plan = await this.plan(id, context);
    const deps = plan.order.filter((m) => m !== id);
    if (deps.length > 0 && !withDependencies) {
      throw new UnmetDependenciesError(id, deps);
    }
    for (const moduleId of plan.order) {
      const manifest = this.catalog[moduleId];
      if (!manifest) throw new UnknownCatalogItemError('module', moduleId);
      if (!(await this.store.exists(moduleId))) {
        await this.store.create(manifest);
      }
    }
    return plan;
  }

  /** Remove a module, refusing if another installed module depends on it. */
  async remove(id: string): Promise<void> {
    const installed = await this.store.readAll();
    const dependents = installed
      .filter((m) => m.dependencies.includes(id))
      .map((m) => m.id);
    if (dependents.length > 0) {
      throw new HasDependentsError(id, dependents);
    }
    await this.store.remove(id);
  }
}
