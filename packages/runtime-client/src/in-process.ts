import { RuntimeEngine, type AiProviderManifest } from '@relay/runtime-core';
import type {
  AiApi,
  AiProviderSummary,
  RuntimeApi,
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
}
