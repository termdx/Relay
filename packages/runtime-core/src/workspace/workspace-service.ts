import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { WorkspaceExistsError, WorkspaceNotFoundError } from '../errors';
import { dumpYaml, loadYaml } from '../manifest/yaml';
import { relayConfigSchema, type RelayConfig } from '../schemas/relay';
import { fileExists } from '../util/fs';
import { RELAY_YAML, workspaceDirs, workspacePaths } from './paths';

export interface InitOptions {
  organization: string;
  slug?: string;
  mode?: 'local' | 'server';
  storagePath?: string;
  desktop?: boolean;
  telemetry?: boolean;
  /** Compose project/network name — must be unique per workspace on a host. */
  networkName?: string;
}

const WORKSPACE_GITIGNORE = `# Relay workspace — runtime-managed. Do not edit generated files by hand.
secrets/
generated/
data/
`;

/** Creates and locates Relay workspaces. */
export class WorkspaceService {
  /** Walk up from startDir until a relay.yaml is found. */
  static async locate(startDir: string): Promise<string> {
    let dir = resolve(startDir);
    for (;;) {
      if (await fileExists(join(dir, RELAY_YAML))) return dir;
      const parent = dirname(dir);
      if (parent === dir) throw new WorkspaceNotFoundError(startDir);
      dir = parent;
    }
  }

  static async init(dir: string, opts: InitOptions): Promise<string> {
    const root = resolve(dir);
    const paths = workspacePaths(root);
    if (await fileExists(paths.relayYaml)) {
      throw new WorkspaceExistsError(root);
    }

    await mkdir(root, { recursive: true });
    for (const d of workspaceDirs(paths)) {
      await mkdir(d, { recursive: true });
    }

    const config = relayConfigSchema.parse({
      organization: { name: opts.organization, slug: opts.slug },
      runtime: { mode: opts.mode ?? 'local', version: '0.1.0' },
      ...(opts.networkName ? { network: { name: opts.networkName } } : {}),
      storage: { path: opts.storagePath ?? './data' },
      desktop: { enabled: opts.desktop ?? true },
      telemetry: { enabled: opts.telemetry ?? false },
    });
    await dumpYaml(paths.relayYaml, relayConfigSchema, config);
    await writeFile(join(root, '.gitignore'), WORKSPACE_GITIGNORE, 'utf8');

    return root;
  }

  static async loadConfig(root: string): Promise<RelayConfig> {
    return loadYaml(workspacePaths(root).relayYaml, relayConfigSchema);
  }
}
