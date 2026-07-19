import { mkdir, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { RuntimeEngine } from '../engine';
import { AlreadyExistsError } from '../errors';
import { fileExists } from '../util/fs';
import { RELAY_YAML } from './paths';
import { WorkspaceService } from './workspace-service';

/**
 * Every workspace starts with the base `projects` module — it carries the
 * backend + postgres services, so `runtime.up` on a brand-new workspace has
 * something to run instead of failing on an empty compose file.
 */
async function installBaseModule(root: string): Promise<void> {
  const engine = await RuntimeEngine.open(root);
  await engine.addModule('projects', true);
}

/**
 * A well-known home for workspaces, so the daemon never depends on the
 * directory it happened to be started in (a daemon's cwd is an accident;
 * dockerd doesn't work that way either).
 *
 *   $HOME/.relay/workspaces/<name>
 *
 * Overridable: RELAY_WORKSPACES_ROOT (the container) or RELAY_WORKSPACE (an
 * exact workspace path).
 */
export function workspacesRoot(): string {
  return (
    process.env.RELAY_WORKSPACES_ROOT ?? join(homedir(), '.relay', 'workspaces')
  );
}

export const DEFAULT_WORKSPACE_NAME = 'default';

/** The workspace the daemon serves unless explicitly overridden. */
export function defaultWorkspaceRoot(): string {
  return (
    process.env.RELAY_WORKSPACE ?? join(workspacesRoot(), DEFAULT_WORKSPACE_NAME)
  );
}

/** Create the default workspace if it isn't there yet. Idempotent. */
export async function ensureDefaultWorkspace(
  organization = 'My Workspace',
): Promise<{ root: string; created: boolean }> {
  const root = defaultWorkspaceRoot();
  if (await fileExists(join(root, RELAY_YAML))) {
    return { root, created: false };
  }
  await WorkspaceService.init(root, { organization });
  await installBaseModule(root);
  return { root, created: true };
}

export interface WorkspaceSummary {
  name: string;
  root: string;
  organization: string;
  isDefault: boolean;
}

/** Every workspace under the workspaces home (a dir is one if it has relay.yaml). */
export async function listWorkspaces(): Promise<WorkspaceSummary[]> {
  const home = workspacesRoot();
  let entries: string[];
  try {
    entries = (await readdir(home, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }

  const defaultRoot = defaultWorkspaceRoot();
  const found: WorkspaceSummary[] = [];
  for (const name of entries.sort()) {
    const root = join(home, name);
    if (!(await fileExists(join(root, RELAY_YAML)))) continue;
    try {
      const config = await WorkspaceService.loadConfig(root);
      found.push({
        name,
        root,
        organization: config.organization.name,
        isDefault: root === defaultRoot,
      });
    } catch {
      // Unreadable/invalid workspace — skip rather than fail the whole list.
    }
  }
  return found;
}

/** Create a new named workspace under the workspaces home. */
export async function createWorkspace(
  name: string,
  organization: string,
): Promise<WorkspaceSummary> {
  const home = workspacesRoot();
  await mkdir(home, { recursive: true });
  const root = join(home, name);
  if (await fileExists(join(root, RELAY_YAML))) {
    throw new AlreadyExistsError('workspace', name);
  }
  // Compose project names must be unique per host — a second workspace with
  // project "relay" would silently take over the first one's containers.
  const networkName =
    name === DEFAULT_WORKSPACE_NAME ? 'relay' : `relay-${name}`;
  await WorkspaceService.init(root, { organization, networkName });
  await installBaseModule(root);
  return {
    name,
    root,
    organization,
    isDefault: root === defaultWorkspaceRoot(),
  };
}
