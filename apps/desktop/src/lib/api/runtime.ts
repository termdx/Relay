import { getServerConfig, runtimeUrl } from "./http";
import type {
  AiProviderSummary,
  IntegrationSummary,
  ModuleSummary,
  RuntimeHealth,
} from "./types";

interface RpcResponse<T> {
  ok: boolean;
  result?: T;
  error?: string;
}

/** A daemon-side failure, surfaced with the runtime's own message. */
export class RuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeError";
  }
}

async function rpc<T>(path: string[], args: unknown[]): Promise<T> {
  const { runtimeToken } = getServerConfig();
  const res = await fetch(`${runtimeUrl()}/rpc`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(runtimeToken ? { "x-relay-token": runtimeToken } : {}),
    },
    body: JSON.stringify({ path, args }),
  });
  const data = (await res.json()) as RpcResponse<T>;
  if (!data.ok) throw new RuntimeError(data.error ?? "runtime error");
  return data.result as T;
}

export interface DaemonHealth {
  status: string;
  name: string;
  version: string;
  /** The workspace the daemon serves — read from the daemon, never guessed. */
  workspace: string;
}

/** Is the Runtime daemon reachable, and which workspace does it serve? */
export async function daemonHealth(): Promise<DaemonHealth | null> {
  try {
    const res = await fetch(`${runtimeUrl()}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    return (await res.json()) as DaemonHealth;
  } catch {
    return null;
  }
}

export interface WorkspaceSummary {
  name: string;
  root: string;
  organization: string;
  isDefault: boolean;
}

export interface WorkspaceInfo {
  root: string;
  organization: string;
  mode: string;
  apiPort: number;
}

export interface InstallPlan {
  target: string;
  order: string[];
  alreadyInstalled: string[];
  missingIntegrations: string[];
  missingAiCapabilities: string[];
}

export interface ProviderHealth {
  id: string;
  status: "ok" | "error" | "unknown";
  detail?: string;
  models?: string[];
}

export interface IntegrationHealth {
  id: string;
  checks: { name: string; status: string; detail?: string }[];
}

export interface IntegrationManifest {
  id: string;
  version: string;
  displayName?: string;
  credentials: { name: string; secretRef: string; required: boolean }[];
}

export interface GithubDeviceStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
  expiresIn: number;
}

export interface GithubDevicePoll {
  status: "pending" | "complete" | "error";
  interval?: number;
  message?: string;
}

export interface Diagnostic {
  level: "error" | "warning";
  code: string;
  message: string;
}

/**
 * Runtime (admin) API over the daemon's /rpc. Every call takes the workspace
 * root the daemon reported — never a relative path.
 */
export const runtime = {
  workspaces: {
    list: () => rpc<WorkspaceSummary[]>(["workspace", "list"], []),
    create: (name: string, organization: string) =>
      rpc<WorkspaceSummary>(["workspace", "create"], [name, organization]),
    info: (cwd: string) => rpc<WorkspaceInfo>(["workspace", "info"], [cwd]),
  },
  health: (cwd: string) => rpc<RuntimeHealth>(["health"], [cwd]),
  validate: (cwd: string) => rpc<Diagnostic[]>(["validate"], [cwd]),
  ai: {
    list: (cwd: string) => rpc<AiProviderSummary[]>(["ai", "list"], [cwd]),
    add: (input: {
      cwd: string;
      provider: string;
      id?: string;
      apiKey?: string;
      endpoint?: string;
      defaultModel?: string;
    }) => rpc<AiProviderSummary>(["ai", "add"], [input]),
    remove: (cwd: string, id: string) => rpc<void>(["ai", "remove"], [cwd, id]),
    health: (cwd: string, id: string) =>
      rpc<ProviderHealth>(["ai", "health"], [cwd, id]),
    models: (cwd: string, id: string) =>
      rpc<string[]>(["ai", "models"], [cwd, id]),
  },
  modules: {
    list: (cwd: string) => rpc<ModuleSummary[]>(["modules", "list"], [cwd]),
    catalog: (cwd: string) => rpc<ModuleSummary[]>(["modules", "catalog"], [cwd]),
    plan: (cwd: string, id: string) => rpc<InstallPlan>(["modules", "plan"], [cwd, id]),
    add: (cwd: string, id: string, withDependencies: boolean) =>
      rpc<InstallPlan>(["modules", "add"], [cwd, id, withDependencies]),
    create: (
      cwd: string,
      input: {
        id: string;
        displayName?: string;
        description?: string;
        capabilities?: {
          ui?: boolean;
          apiRoutes?: boolean;
          storage?: boolean;
          ai?: boolean;
        };
      },
    ) => rpc<ModuleSummary>(["modules", "create"], [cwd, input]),
    remove: (cwd: string, id: string) => rpc<void>(["modules", "remove"], [cwd, id]),
  },
  integrations: {
    list: (cwd: string) =>
      rpc<IntegrationSummary[]>(["integrations", "list"], [cwd]),
    catalog: (cwd: string) =>
      rpc<IntegrationManifest[]>(["integrations", "catalog"], [cwd]),
    add: (cwd: string, id: string, credentials: Record<string, string>) =>
      rpc<IntegrationSummary>(["integrations", "add"], [cwd, id, credentials]),
    remove: (cwd: string, id: string) =>
      rpc<void>(["integrations", "remove"], [cwd, id]),
    health: (cwd: string, id: string) =>
      rpc<IntegrationHealth>(["integrations", "health"], [cwd, id]),
    githubDeviceStart: (cwd: string, clientId?: string) =>
      rpc<GithubDeviceStart>(
        ["integrations", "githubDeviceStart"],
        [cwd, clientId],
      ),
    githubDevicePoll: (cwd: string, deviceCode: string) =>
      rpc<GithubDevicePoll>(
        ["integrations", "githubDevicePoll"],
        [cwd, deviceCode],
      ),
  },
  workflows: {
    list: (cwd: string) =>
      rpc<{ id: string; displayName?: string; version: string; module?: string }[]>(
        ["workflows", "list"],
        [cwd],
      ),
    create: (
      cwd: string,
      input: { id: string; displayName?: string; description?: string; module?: string },
    ) => rpc<{ id: string }>(["workflows", "create"], [cwd, input]),
    remove: (cwd: string, id: string) => rpc<void>(["workflows", "remove"], [cwd, id]),
  },
  agents: {
    list: (cwd: string) =>
      rpc<
        {
          id: string;
          name: string;
          model: string;
          mission?: string;
          projects?: string[];
          tools?: string[];
          workflow?: string;
        }[]
      >(["agents", "list"], [cwd]),
    create: (
      cwd: string,
      input: {
        id: string;
        name: string;
        model: string;
        mission?: string;
        projects?: string[];
        tools?: string[];
        workflow?: string;
        memory?: "none" | "buffer" | "vector";
      },
    ) => rpc<{ id: string }>(["agents", "create"], [cwd, input]),
    update: (
      cwd: string,
      id: string,
      changes: {
        name?: string;
        model?: string;
        mission?: string;
        projects?: string[];
        tools?: string[];
      },
    ) => rpc<{ id: string }>(["agents", "update"], [cwd, id, changes]),
    remove: (cwd: string, id: string) => rpc<void>(["agents", "remove"], [cwd, id]),
  },
  stack: {
    up: (cwd: string) => rpc<{ services: string[] }>(["runtime", "up"], [cwd]),
    down: (cwd: string) => rpc<void>(["runtime", "down"], [cwd]),
    status: (cwd: string) =>
      rpc<{ service: string; state: string; health?: string }[]>(["runtime", "status"], [cwd]),
  },
};
