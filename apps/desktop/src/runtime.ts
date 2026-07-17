/**
 * Browser-safe Runtime API client for the desktop control plane. The desktop
 * talks to the same local Runtime daemon the CLI uses (POST /rpc) — it never
 * touches workspace files directly.
 *
 * Types are declared locally (not imported from the node-side runtime packages)
 * so nothing node-specific leaks into the browser bundle. They mirror the
 * RuntimeApi contract served by @relay/runtime.
 */
const DEFAULT_URL = 'http://127.0.0.1:51720';

export interface WorkspaceInfo {
  root: string;
  organization: string;
  mode: string;
  apiPort: number;
}

export interface RuntimeHealthSummary {
  overall: 'ok' | 'degraded' | 'error';
}

interface RpcResponse<T> {
  ok: boolean;
  result?: T;
  error?: string;
}

async function rpc<T>(
  baseUrl: string,
  path: string[],
  args: unknown[],
): Promise<T> {
  const res = await fetch(`${baseUrl}/rpc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path, args }),
  });
  const data = (await res.json()) as RpcResponse<T>;
  if (!data.ok) throw new Error(data.error ?? 'runtime error');
  return data.result as T;
}

export function createRuntimeClient(baseUrl: string = DEFAULT_URL) {
  return {
    health: (cwd: string): Promise<RuntimeHealthSummary> =>
      rpc(baseUrl, ['health'], [cwd]),
    workspace: {
      info: (cwd: string): Promise<WorkspaceInfo> =>
        rpc(baseUrl, ['workspace', 'info'], [cwd]),
    },
  };
}
