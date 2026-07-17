import { RUNTIME_URL } from "./http";
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

async function rpc<T>(path: string[], args: unknown[]): Promise<T> {
  const res = await fetch(`${RUNTIME_URL}/rpc`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, args }),
  });
  const data = (await res.json()) as RpcResponse<T>;
  if (!data.ok) throw new Error(data.error ?? "runtime error");
  return data.result as T;
}

/** Is the Runtime daemon reachable? Drives the admin section's availability. */
export async function runtimeReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${RUNTIME_URL}/health`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface WorkspaceInfo {
  root: string;
  organization: string;
  mode: string;
  apiPort: number;
}

/**
 * Resolve which workspace this daemon manages. "." is resolved by the daemon
 * against its own working directory — i.e. the daemon serves the workspace it
 * was started in (same model as `docker compose`). Throws if it wasn't started
 * inside one, which the UI reports distinctly from "daemon down".
 */
export function fetchWorkspace(): Promise<WorkspaceInfo> {
  return rpc<WorkspaceInfo>(["workspace", "info"], ["."]);
}

/** Runtime (admin) API — the control-plane surface, over the daemon's /rpc.
 * Every call takes the resolved workspace root, never a relative path. */
export const runtime = {
  health: (cwd: string) => rpc<RuntimeHealth>(["health"], [cwd]),
  ai: {
    list: (cwd: string) => rpc<AiProviderSummary[]>(["ai", "list"], [cwd]),
  },
  modules: {
    list: (cwd: string) => rpc<ModuleSummary[]>(["modules", "list"], [cwd]),
    catalog: (cwd: string) => rpc<ModuleSummary[]>(["modules", "catalog"], [cwd]),
  },
  integrations: {
    list: (cwd: string) =>
      rpc<IntegrationSummary[]>(["integrations", "list"], [cwd]),
  },
};
