import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { INTEGRATION_CATALOG, MODULE_CATALOG } from './catalog/catalog';
import {
  aiProviderEnv,
  buildComposeFile,
  composeHash,
  defaultProvider,
  serializeCompose,
  serializeEnv,
} from './compose/compose-generator';
import { ServiceLifecycle } from './lifecycle/service-lifecycle';
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

export interface GenerateResult {
  services: string[];
  aiProvider?: string;
  composePath: string;
  envPath: string;
}

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

  private async ensureSecret(
    ref: string,
    generate: () => string,
  ): Promise<string> {
    const existing = await this.secrets.get(ref);
    if (existing) return existing;
    const value = generate();
    await this.secrets.set(ref, value);
    return value;
  }

  /**
   * Generate the derived artifacts (docker-compose.yml, .env, runtime.lock)
   * from installed modules + providers + secrets. The AI env is generated here
   * from ai/<id>.yaml, replacing any hand-edited backend .env.
   */
  async generate(): Promise<GenerateResult> {
    const modules = await this.modules.list();
    const providers = await this.ai.list();

    const env: Record<string, string> = {};
    if (modules.some((m) => m.capabilities.storage)) {
      env.POSTGRES_PASSWORD = await this.ensureSecret('postgres.password', () =>
        randomBytes(18).toString('base64url'),
      );
    }
    const provider = defaultProvider(providers);
    const apiKey = provider ? await this.ai.resolveApiKey(provider) : undefined;
    Object.assign(env, aiProviderEnv(provider, apiKey));

    const compose = buildComposeFile(this.config, modules);
    const composeYaml = serializeCompose(compose);
    const lock = {
      hash: composeHash(composeYaml, Object.keys(env)),
      modules: modules.map((m) => m.id).sort(),
      providers: providers.map((p) => p.id).sort(),
      services: Object.keys(compose.services).sort(),
    };

    await mkdir(this.paths.generatedDir, { recursive: true });
    await writeFile(this.paths.composeFile, composeYaml, 'utf8');
    await writeFile(this.paths.envFile, serializeEnv(env), { mode: 0o600 });
    await writeFile(
      this.paths.lockFile,
      `${JSON.stringify(lock, null, 2)}\n`,
      'utf8',
    );

    return {
      services: Object.keys(compose.services).sort(),
      aiProvider: provider?.id,
      composePath: this.paths.composeFile,
      envPath: this.paths.envFile,
    };
  }

  /** Drives docker compose against the generated artifacts. */
  get lifecycle(): ServiceLifecycle {
    return new ServiceLifecycle(
      this.paths.composeFile,
      this.paths.envFile,
      this.config.network.name,
    );
  }

  /** Generate artifacts, then start the stack. */
  async up(): Promise<GenerateResult> {
    const result = await this.generate();
    await this.lifecycle.up();
    return result;
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
