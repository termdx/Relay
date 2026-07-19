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
import { inspectHealth, type RuntimeHealth } from './health/health-monitor';
import { ServiceLifecycle } from './lifecycle/service-lifecycle';
import { ManifestStore } from './manifest/manifest-store';
import {
  DEFAULT_GITHUB_CLIENT_ID,
  pollGithubDeviceFlow,
  startGithubDeviceFlow,
  type GithubDeviceStart,
} from './integrations/github-device';
import { AgentRegistry, type CreateAgentInput } from './registries/agent-registry';
import { AiProviderRegistry } from './registries/ai-provider-registry';
import { IntegrationRegistry } from './registries/integration-registry';
import { ModuleRegistry } from './registries/module-registry';
import {
  WorkflowRegistry,
  type CreateWorkflowInput,
} from './registries/workflow-registry';
import {
  scaffoldAgent,
  scaffoldModule,
  scaffoldWorkflow,
} from './scaffold/scaffolder';
import { EnvFileSecrets } from './secrets/env-file-secrets';
import type { SecretsProvider } from './secrets/secrets-provider';
import { agentManifestSchema, type AgentManifest } from './schemas/agent';
import { aiProviderManifestSchema } from './schemas/ai-provider';
import { integrationManifestSchema } from './schemas/integration';
import { moduleManifestSchema, type ModuleManifest } from './schemas/module';
import type { RelayConfig } from './schemas/relay';
import { workflowManifestSchema, type WorkflowManifest } from './schemas/workflow';
import { validateWorkspace, type Diagnostic } from './validation/validator';

export interface CreateModuleInput {
  id: string;
  displayName?: string;
  description?: string;
  capabilities?: {
    ui?: boolean;
    apiRoutes?: boolean;
    storage?: boolean;
    ai?: boolean;
  };
}
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

  /** Workflow definitions (workflows/<id>.yaml). */
  get workflows(): WorkflowRegistry {
    return new WorkflowRegistry(
      new ManifestStore(this.paths.workflowsDir, workflowManifestSchema, 'workflow'),
    );
  }

  /** Agent definitions (agents/<id>.yaml). */
  get agents(): AgentRegistry {
    return new AgentRegistry(
      new ManifestStore(this.paths.agentsDir, agentManifestSchema, 'agent'),
    );
  }

  /** Create a custom module manifest + scaffold (relay module new). */
  async createModule(input: CreateModuleInput): Promise<ModuleManifest> {
    const manifest = moduleManifestSchema.parse({
      id: input.id,
      version: '0.1.0',
      displayName: input.displayName,
      description: input.description,
      capabilities: input.capabilities,
    });
    await new ManifestStore(
      this.paths.modulesDir,
      moduleManifestSchema,
      'module',
    ).create(manifest);
    await scaffoldModule(this.paths.modulesDir, manifest);
    return manifest;
  }

  /** Create a workflow definition + scaffold (relay workflow new). */
  async createWorkflow(input: CreateWorkflowInput): Promise<WorkflowManifest> {
    const manifest = await this.workflows.create(input);
    await scaffoldWorkflow(this.paths.workflowsDir, manifest);
    return manifest;
  }

  /** Create an agent definition + starter scaffold (relay agent new). */
  async createAgent(input: CreateAgentInput): Promise<AgentManifest> {
    const manifest = await this.agents.create(input);
    await scaffoldAgent(this.paths.agentsDir, manifest);
    return manifest;
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

  /**
   * Begin the GitHub device flow. The client id is remembered (secret
   * github.clientId) so subsequent connects need no input; RELAY_GITHUB_CLIENT_ID
   * serves as a deploy-wide default.
   */
  async githubDeviceStart(clientId?: string): Promise<GithubDeviceStart> {
    const resolved =
      clientId?.trim() ||
      (await this.secrets.get('github.clientId')) ||
      process.env.RELAY_GITHUB_CLIENT_ID ||
      DEFAULT_GITHUB_CLIENT_ID;
    const flow = await startGithubDeviceFlow(resolved);
    await this.secrets.set('github.clientId', resolved);
    return flow;
  }

  /**
   * One poll of the device flow. On success the token is stored and the
   * github integration installed — the token itself is never returned.
   */
  async githubDevicePoll(
    deviceCode: string,
  ): Promise<{ status: 'pending' | 'complete' | 'error'; interval?: number; message?: string }> {
    const clientId = await this.secrets.get('github.clientId');
    if (!clientId) {
      return { status: 'error', message: 'Device flow was never started.' };
    }
    const result = await pollGithubDeviceFlow(clientId, deviceCode);
    if (result.status === 'complete') {
      await this.integrations.add('github', { token: result.token });
      return { status: 'complete' };
    }
    if (result.status === 'pending') {
      return { status: 'pending', interval: result.interval };
    }
    return { status: 'error', message: result.message };
  }

  /** Validate the whole workspace, returning diagnostics (empty = healthy). */
  async validate(): Promise<Diagnostic[]> {
    return validateWorkspace({
      modules: await this.modules.list(),
      integrations: await this.integrations.list(),
      aiProviders: await this.ai.list(),
      secretRefs: await this.secrets.list(),
      workflows: await this.workflows.list(),
      agents: await this.agents.list(),
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
    if (modules.some((m) => m.capabilities.apiRoutes)) {
      // Signing key for desktop sessions — generated once, kept in secrets.
      env.JWT_SECRET = await this.ensureSecret('backend.jwtSecret', () =>
        randomBytes(32).toString('base64url'),
      );
    }
    const provider = defaultProvider(providers);
    const apiKey = provider ? await this.ai.resolveApiKey(provider) : undefined;
    const aiEnv = aiProviderEnv(provider, apiKey);
    Object.assign(env, aiEnv);

    // Installed integrations: resolve each credential secret into an env var
    // (github.token → GITHUB_TOKEN) so adapters select themselves by config.
    // Track the keys — they're injected into the compose services directly,
    // so already-installed module manifests need no reinstall to pick them up.
    // AI env keys are injected into compose services alongside integration
    // credentials — installed module manifests never need reinstalling to
    // pick up a newly supported provider's variables.
    const integrationEnvKeys: string[] = [...Object.keys(aiEnv)];
    const installedIntegrations = await this.integrations.list();
    for (const integration of installedIntegrations) {
      for (const field of integration.credentials) {
        const value = await this.secrets.get(field.secretRef);
        if (value) {
          const key = `${integration.id}_${field.name}`
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '_');
          env[key] = value;
          integrationEnvKeys.push(key);
        }
      }
    }
    // Hosted deployments export RELAY_PUBLIC_URL (https://relay.agency.com):
    // it becomes the approval-link base and the portal URL in emails.
    if (process.env.RELAY_PUBLIC_URL) {
      const publicUrl = process.env.RELAY_PUBLIC_URL.replace(/\/$/, '');
      env.PUBLIC_BASE_URL = publicUrl;
      env.PUBLIC_PORTAL_URL = publicUrl;
      integrationEnvKeys.push('PUBLIC_BASE_URL', 'PUBLIC_PORTAL_URL');
    }
    // Invite links hand joining teammates a ready-to-use desktop connection,
    // so the backend needs the daemon's token to include in the redeem
    // response. Same trust domain — the daemon drives this backend anyway.
    if (process.env.RELAY_RUNTIME_TOKEN) {
      env.RELAY_RUNTIME_TOKEN = process.env.RELAY_RUNTIME_TOKEN;
      integrationEnvKeys.push('RELAY_RUNTIME_TOKEN');
    }

    // Transcript ingest: every workspace gets a generated shared secret so
    // notetakers/automation can POST transcripts (webhooks/transcript/:project).
    env.INGEST_SECRET = await this.ensureSecret('ingest.secret', () =>
      randomBytes(24).toString('base64url'),
    );
    integrationEnvKeys.push('INGEST_SECRET');

    // Tracker connected → the backend can receive its webhooks. Secrets are
    // generated here (not user-supplied), so they live outside the manifests'
    // credential lists.
    for (const provider of ['github', 'gitlab', 'bitbucket'] as const) {
      if (installedIntegrations.some((i) => i.id === provider)) {
        const key = `${provider.toUpperCase()}_WEBHOOK_SECRET`;
        env[key] = await this.ensureSecret(`${provider}.webhookSecret`, () =>
          randomBytes(24).toString('base64url'),
        );
        integrationEnvKeys.push(key);
      }
    }

    const compose = buildComposeFile(this.config, modules, integrationEnvKeys);
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

  /** Full health: environment prerequisites, services, workspace diagnostics. */
  async health(): Promise<RuntimeHealth> {
    return inspectHealth(this.lifecycle, await this.validate());
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
