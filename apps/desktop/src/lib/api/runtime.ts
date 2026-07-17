import { RUNTIME_URL } from "./http";
import type {
  AiProviderSummary,
  IntegrationSummary,
  ModuleSummary,
  RuntimeHealth,
} from "./types";

/** The desktop's workspace path, sent with every runtime call. In the
 * self-hosted single-machine case this is the local workspace the daemon
 * manages; wired to a real value once workspace selection exists. */
const WORKSPACE_CWD = ".";

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
      signal: AbortSignal.timeout(600),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Runtime (admin) API — the control-plane surface, over the daemon's /rpc. */
export const runtime = {
  health: () => rpc<RuntimeHealth>(["health"], [WORKSPACE_CWD]),
  ai: {
    list: () => rpc<AiProviderSummary[]>(["ai", "list"], [WORKSPACE_CWD]),
  },
  modules: {
    list: () => rpc<ModuleSummary[]>(["modules", "list"], [WORKSPACE_CWD]),
    catalog: () => rpc<ModuleSummary[]>(["modules", "catalog"], [WORKSPACE_CWD]),
  },
  integrations: {
    list: () =>
      rpc<IntegrationSummary[]>(["integrations", "list"], [WORKSPACE_CWD]),
  },
};
