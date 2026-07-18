import {
  RuntimeEngine,
  createWorkspace,
  defaultWorkspaceRoot,
  listWorkspaces,
  type AiProviderManifest,
  type Diagnostic,
} from '@relay/runtime-core';
import type {
  AgentsApi,
  AiApi,
  AiProviderSummary,
  ComposeApi,
  IntegrationsApi,
  ModulesApi,
  RuntimeApi,
  RuntimeLifecycleApi,
  WorkflowsApi,
  WorkspaceApi,
  WorkspaceInfo,
  WorkspaceInitInput,
} from './api';

function toInfo(engine: RuntimeEngine): WorkspaceInfo {
  return {
    root: engine.paths.root,
    organization: engine.config.organization.name,
    mode: engine.config.runtime.mode,
    apiPort: engine.config.network.apiPort,
  };
}

function toAiSummary(manifest: AiProviderManifest): AiProviderSummary {
  return {
    id: manifest.id,
    provider: manifest.provider,
    defaultModel: manifest.defaultModel,
    hasApiKey: Boolean(manifest.apiKeyRef),
    models: manifest.models,
  };
}

/**
 * In-process transport: runs the engine directly in the caller's process.
 * Used for bootstrap (`relay init`, before any daemon exists) and one-shot
 * commands. Same contract as the HTTP transport.
 */
export class InProcessClient implements RuntimeApi {
  readonly workspace: WorkspaceApi = {
    init: async (input: WorkspaceInitInput): Promise<WorkspaceInfo> => {
      const engine = await RuntimeEngine.init(input.dir, {
        organization: input.organization,
        slug: input.slug,
        mode: input.mode,
        storagePath: input.storagePath,
        desktop: input.desktop,
        telemetry: input.telemetry,
      });
      return toInfo(engine);
    },
    info: async (cwd: string): Promise<WorkspaceInfo> => {
      const engine = await RuntimeEngine.open(cwd);
      return toInfo(engine);
    },
    list: () => listWorkspaces(),
    create: (name, organization) => createWorkspace(name, organization),
    default: () => Promise.resolve(defaultWorkspaceRoot()),
  };

  readonly ai: AiApi = {
    add: async (input): Promise<AiProviderSummary> => {
      const engine = await RuntimeEngine.open(input.cwd);
      const manifest = await engine.ai.add({
        provider: input.provider,
        id: input.id,
        apiKey: input.apiKey,
        endpoint: input.endpoint,
        defaultModel: input.defaultModel,
      });
      return toAiSummary(manifest);
    },
    list: async (cwd): Promise<AiProviderSummary[]> => {
      const engine = await RuntimeEngine.open(cwd);
      return (await engine.ai.list()).map(toAiSummary);
    },
    info: async (cwd, id): Promise<AiProviderSummary> => {
      const engine = await RuntimeEngine.open(cwd);
      return toAiSummary(await engine.ai.info(id));
    },
    remove: async (cwd, id): Promise<void> => {
      const engine = await RuntimeEngine.open(cwd);
      await engine.ai.remove(id);
    },
    health: async (cwd, id) => {
      const engine = await RuntimeEngine.open(cwd);
      return engine.ai.health(id);
    },
    models: async (cwd, id): Promise<string[]> => {
      const engine = await RuntimeEngine.open(cwd);
      return engine.ai.models(id);
    },
  };

  readonly modules: ModulesApi = {
    catalog: async (cwd) => (await RuntimeEngine.open(cwd)).modules.catalogItems(),
    list: async (cwd) => (await RuntimeEngine.open(cwd)).modules.list(),
    info: async (cwd, id) => (await RuntimeEngine.open(cwd)).modules.info(id),
    plan: async (cwd, id) => (await RuntimeEngine.open(cwd)).planModule(id),
    add: async (cwd, id, withDependencies) =>
      (await RuntimeEngine.open(cwd)).addModule(id, withDependencies),
    create: async (cwd, input) =>
      (await RuntimeEngine.open(cwd)).createModule(input),
    remove: async (cwd, id) => {
      const engine = await RuntimeEngine.open(cwd);
      await engine.modules.remove(id);
    },
  };

  readonly workflows: WorkflowsApi = {
    list: async (cwd) => (await RuntimeEngine.open(cwd)).workflows.list(),
    info: async (cwd, id) => (await RuntimeEngine.open(cwd)).workflows.info(id),
    create: async (cwd, input) =>
      (await RuntimeEngine.open(cwd)).createWorkflow(input),
    remove: async (cwd, id) => {
      const engine = await RuntimeEngine.open(cwd);
      await engine.workflows.remove(id);
    },
  };

  readonly agents: AgentsApi = {
    list: async (cwd) => (await RuntimeEngine.open(cwd)).agents.list(),
    info: async (cwd, id) => (await RuntimeEngine.open(cwd)).agents.info(id),
    create: async (cwd, input) =>
      (await RuntimeEngine.open(cwd)).createAgent(input),
    remove: async (cwd, id) => {
      const engine = await RuntimeEngine.open(cwd);
      await engine.agents.remove(id);
    },
  };

  readonly integrations: IntegrationsApi = {
    catalog: async (cwd) =>
      (await RuntimeEngine.open(cwd)).integrations.catalogItems(),
    list: async (cwd) => (await RuntimeEngine.open(cwd)).integrations.list(),
    info: async (cwd, id) =>
      (await RuntimeEngine.open(cwd)).integrations.info(id),
    add: async (cwd, id, credentials) =>
      (await RuntimeEngine.open(cwd)).integrations.add(id, credentials),
    remove: async (cwd, id) => {
      const engine = await RuntimeEngine.open(cwd);
      await engine.integrations.remove(id);
    },
    health: async (cwd, id) =>
      (await RuntimeEngine.open(cwd)).integrations.health(id),
    githubDeviceStart: async (cwd, clientId) =>
      (await RuntimeEngine.open(cwd)).githubDeviceStart(clientId),
    githubDevicePoll: async (cwd, deviceCode) =>
      (await RuntimeEngine.open(cwd)).githubDevicePoll(deviceCode),
  };

  readonly compose: ComposeApi = {
    generate: async (cwd) => (await RuntimeEngine.open(cwd)).generate(),
    config: async (cwd) => (await RuntimeEngine.open(cwd)).lifecycle.config(),
  };

  readonly runtime: RuntimeLifecycleApi = {
    up: async (cwd) => (await RuntimeEngine.open(cwd)).up(),
    down: async (cwd) => {
      await (await RuntimeEngine.open(cwd)).lifecycle.down();
    },
    restart: async (cwd) => {
      await (await RuntimeEngine.open(cwd)).lifecycle.restart();
    },
    logs: async (cwd, options) => {
      await (await RuntimeEngine.open(cwd)).lifecycle.logs(options);
    },
    status: async (cwd) => (await RuntimeEngine.open(cwd)).lifecycle.status(),
  };

  validate = async (cwd: string): Promise<Diagnostic[]> => {
    const engine = await RuntimeEngine.open(cwd);
    return engine.validate();
  };

  health = async (cwd: string) => {
    const engine = await RuntimeEngine.open(cwd);
    return engine.health();
  };
}
