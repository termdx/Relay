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
  health(cwd: string, id: string): Promise<AiHealth>;
  models(cwd: string, id: string): Promise<string[]>;
}

import type {
  Diagnostic,
  InstallPlan,
  IntegrationHealth,
  IntegrationManifest,
  ModuleManifest,
} from '@relay/runtime-core';

export interface ModulesApi {
  catalog(cwd: string): Promise<ModuleManifest[]>;
  list(cwd: string): Promise<ModuleManifest[]>;
  info(cwd: string, id: string): Promise<ModuleManifest>;
  plan(cwd: string, id: string): Promise<InstallPlan>;
  add(cwd: string, id: string, withDependencies: boolean): Promise<InstallPlan>;
  remove(cwd: string, id: string): Promise<void>;
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
}

export interface RuntimeApi {
  workspace: WorkspaceApi;
  ai: AiApi;
  modules: ModulesApi;
  integrations: IntegrationsApi;
  validate(cwd: string): Promise<Diagnostic[]>;
}
