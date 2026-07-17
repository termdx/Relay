import { join } from 'node:path';
import { EnvFileSecrets } from './secrets/env-file-secrets';
import type { SecretsProvider } from './secrets/secrets-provider';
import type { RelayConfig } from './schemas/relay';
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
