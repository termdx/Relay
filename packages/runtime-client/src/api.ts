/**
 * The Relay Runtime API contract. Every client (CLI, Desktop, future Web UI)
 * talks to the runtime exclusively through this interface — never by touching
 * workspace files directly. Implemented in-process today; over HTTP in P6.
 *
 * The surface grows one namespace per phase (ai, modules, integrations, …).
 */
export interface WorkspaceInitInput {
  dir: string;
  organization: string;
  slug?: string;
  mode?: 'local' | 'server';
  storagePath?: string;
  desktop?: boolean;
  telemetry?: boolean;
}

export interface WorkspaceInfo {
  root: string;
  organization: string;
  mode: string;
  apiPort: number;
}

export interface WorkspaceApi {
  init(input: WorkspaceInitInput): Promise<WorkspaceInfo>;
  info(cwd: string): Promise<WorkspaceInfo>;
}

export interface RuntimeApi {
  workspace: WorkspaceApi;
}
