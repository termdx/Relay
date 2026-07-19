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
  /** Workspaces under the well-known home ($HOME/.relay/workspaces). */
  list(): Promise<WorkspaceSummary[]>;
  /** Create a named workspace under the workspaces home. */
  create(name: string, organization: string): Promise<WorkspaceSummary>;
  /** The workspace the daemon serves by default. */
  default(): Promise<string>;
}

export interface AiAddInput {
  cwd: string;
  provider: string;
  id?: string;
  apiKey?: string;
  endpoint?: string;
  defaultModel?: string;
}

export interface AiProviderSummary {
  id: string;
  provider: string;
  defaultModel?: string;
  hasApiKey: boolean;
  models: string[];
  /** True when this is the active provider for Relay AI (top priority). */
  isDefault: boolean;
}

export interface AiHealth {
  id: string;
  status: 'ok' | 'error' | 'unknown';
  detail?: string;
  models?: string[];
}

export interface AiApi {
  add(input: AiAddInput): Promise<AiProviderSummary>;
  list(cwd: string): Promise<AiProviderSummary[]>;
  info(cwd: string, id: string): Promise<AiProviderSummary>;
  remove(cwd: string, id: string): Promise<void>;
  setDefault(cwd: string, id: string): Promise<void>;
  health(cwd: string, id: string): Promise<AiHealth>;
  models(cwd: string, id: string): Promise<string[]>;
}

import type {
  AgentManifest,
  CreateAgentInput,
  CreateModuleInput,
  CreateWorkflowInput,
  Diagnostic,
  GenerateResult,
  InstallPlan,
  IntegrationHealth,
  IntegrationManifest,
  LogsOptions,
  ModuleManifest,
  RuntimeHealth,
  ServiceStatus,
  WorkflowManifest,
  WorkspaceSummary,
} from '@relay/runtime-core';

export type { WorkspaceSummary };

export interface ModulesApi {
  catalog(cwd: string): Promise<ModuleManifest[]>;
  list(cwd: string): Promise<ModuleManifest[]>;
  info(cwd: string, id: string): Promise<ModuleManifest>;
  plan(cwd: string, id: string): Promise<InstallPlan>;
  add(cwd: string, id: string, withDependencies: boolean): Promise<InstallPlan>;
  create(cwd: string, input: CreateModuleInput): Promise<ModuleManifest>;
  remove(cwd: string, id: string): Promise<void>;
}

export interface WorkflowsApi {
  list(cwd: string): Promise<WorkflowManifest[]>;
  info(cwd: string, id: string): Promise<WorkflowManifest>;
  create(cwd: string, input: CreateWorkflowInput): Promise<WorkflowManifest>;
  remove(cwd: string, id: string): Promise<void>;
}

export interface AgentsApi {
  list(cwd: string): Promise<AgentManifest[]>;
  info(cwd: string, id: string): Promise<AgentManifest>;
  create(cwd: string, input: CreateAgentInput): Promise<AgentManifest>;
  update(
    cwd: string,
    id: string,
    changes: Partial<Omit<CreateAgentInput, 'id'>>,
  ): Promise<AgentManifest>;
  remove(cwd: string, id: string): Promise<void>;
}

export interface GithubDeviceStartResult {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
  expiresIn: number;
}

export interface GithubDevicePollResult {
  status: 'pending' | 'complete' | 'error';
  interval?: number;
  message?: string;
}

export interface IntegrationsApi {
  catalog(cwd: string): Promise<IntegrationManifest[]>;
  list(cwd: string): Promise<IntegrationManifest[]>;
  info(cwd: string, id: string): Promise<IntegrationManifest>;
  add(
    cwd: string,
    id: string,
    credentials: Record<string, string>,
  ): Promise<IntegrationManifest>;
  remove(cwd: string, id: string): Promise<void>;
  health(cwd: string, id: string): Promise<IntegrationHealth>;
  /** OAuth device flow — the no-paste GitHub connect. Tokens never round-trip:
   * on completion the runtime stores them and installs the integration. */
  githubDeviceStart(
    cwd: string,
    clientId?: string,
  ): Promise<GithubDeviceStartResult>;
  githubDevicePoll(
    cwd: string,
    deviceCode: string,
  ): Promise<GithubDevicePollResult>;
}

export interface ComposeApi {
  generate(cwd: string): Promise<GenerateResult>;
  config(cwd: string): Promise<string>;
}

export interface RuntimeLifecycleApi {
  up(cwd: string): Promise<GenerateResult>;
  down(cwd: string): Promise<void>;
  restart(cwd: string): Promise<void>;
  logs(cwd: string, options: LogsOptions): Promise<void>;
  status(cwd: string): Promise<ServiceStatus[]>;
}

export interface RuntimeApi {
  workspace: WorkspaceApi;
  ai: AiApi;
  modules: ModulesApi;
  integrations: IntegrationsApi;
  workflows: WorkflowsApi;
  agents: AgentsApi;
  compose: ComposeApi;
  runtime: RuntimeLifecycleApi;
  validate(cwd: string): Promise<Diagnostic[]>;
  health(cwd: string): Promise<RuntimeHealth>;
}
