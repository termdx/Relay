import { RuntimeEngine } from '@relay/runtime-core';
import type {
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
}
