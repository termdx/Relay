import { join } from 'node:path';
import { INTEGRATION_CATALOG, MODULE_CATALOG } from './catalog/catalog';
import { ManifestStore } from './manifest/manifest-store';
import { AiProviderRegistry } from './registries/ai-provider-registry';
import { IntegrationRegistry } from './registries/integration-registry';
import { ModuleRegistry } from './registries/module-registry';
import { EnvFileSecrets } from './secrets/env-file-secrets';
import type { SecretsProvider } from './secrets/secrets-provider';
import { aiProviderManifestSchema } from './schemas/ai-provider';
import { integrationManifestSchema } from './schemas/integration';
import { moduleManifestSchema } from './schemas/module';
import type { RelayConfig } from './schemas/relay';
import { validateWorkspace, type Diagnostic } from './validation/validator';
import {
  WorkspaceService,
  type InitOptions,
} from './workspace/workspace-service';
import { workspacePaths, type WorkspacePaths } from './workspace/paths';

/**
 * The runtime engine — the composition root for a single opened workspace, and
 * the only writer of its state. Transports (in-process, HTTP daemon) wrap an
 * instance of this; they add no logic.
 */
export class RuntimeEngine {
  private constructor(
    readonly paths: WorkspacePaths,
    readonly config: RelayConfig,
    readonly secrets: SecretsProvider,
  ) {}

  /** Installed AI providers (ai/<id>.yaml). */
  get ai(): AiProviderRegistry {
    return new AiProviderRegistry(
      new ManifestStore(this.paths.aiDir, aiProviderManifestSchema, 'ai-provider'),
      this.secrets,
    );
  }

  /** Installed modules (modules/<id>.yaml). */
  get modules(): ModuleRegistry {
    return new ModuleRegistry(
      new ManifestStore(this.paths.modulesDir, moduleManifestSchema, 'module'),
      MODULE_CATALOG,
    );
  }

  /** Installed integrations (integrations/<id>.yaml). */
  get integrations(): IntegrationRegistry {
    return new IntegrationRegistry(
      new ManifestStore(
        this.paths.integrationsDir,
        integrationManifestSchema,
        'integration',
      ),
      INTEGRATION_CATALOG,
      this.secrets,
    );
  }

  /** Current installed AI capabilities across all providers. */
  private async installedAiCapabilities(): Promise<string[]> {
    const providers = await this.ai.list();
    return [...new Set(providers.flatMap((p) => p.capabilities))];
  }

  /** Resolve what installing `moduleId` would entail. */
  async planModule(moduleId: string) {
    return this.modules.plan(moduleId, {
      installedIntegrations: await this.integrations.installedIds(),
      installedAiCapabilities: await this.installedAiCapabilities(),
    });
  }

  /** Install a module (optionally pulling in its missing dependencies). */
  async addModule(moduleId: string, withDependencies: boolean) {
    return this.modules.add(
      moduleId,
      {
        installedIntegrations: await this.integrations.installedIds(),
        installedAiCapabilities: await this.installedAiCapabilities(),
      },
      withDependencies,
    );
  }

  /** Validate the whole workspace, returning diagnostics (empty = healthy). */
  async validate(): Promise<Diagnostic[]> {
    return validateWorkspace({
      modules: await this.modules.list(),
      integrations: await this.integrations.list(),
      aiProviders: await this.ai.list(),
      secretRefs: await this.secrets.list(),
    });
  }

  /** Create a new workspace and open it. */
  static async init(dir: string, opts: InitOptions): Promise<RuntimeEngine> {
    const root = await WorkspaceService.init(dir, opts);
    return RuntimeEngine.open(root);
  }

  /** Locate and open the workspace containing `cwd`. */
  static async open(cwd: string): Promise<RuntimeEngine> {
    const root = await WorkspaceService.locate(cwd);
    const paths = workspacePaths(root);
    const config = await WorkspaceService.loadConfig(root);
    const secrets = new EnvFileSecrets(
      join(paths.secretsDir, 'master.key'),
      paths.secretsFile,
    );
    return new RuntimeEngine(paths, config, secrets);
  }
}
