import { InProcessClient } from './in-process';
import type {
  AiApi,
  ComposeApi,
  IntegrationsApi,
  ModulesApi,
  RuntimeApi,
  RuntimeLifecycleApi,
  WorkspaceApi,
} from './api';

interface RpcResponse<T> {
  ok: boolean;
  result?: T;
  error?: string;
  code?: string;
}

/**
 * HTTP transport: talks to a running Runtime API daemon. Every stateful call
 * goes over /rpc so the daemon remains the single writer. Log streaming is the
 * one exception — it needs a local TTY, so it runs in-process.
 */
export class HttpClient implements RuntimeApi {
  private readonly local = new InProcessClient();

  constructor(private readonly baseUrl: string) {}

  private async rpc<T>(path: string[], args: unknown[]): Promise<T> {
    const res = await fetch(`${this.baseUrl}/rpc`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path, args }),
    });
    const data = (await res.json()) as RpcResponse<T>;
    if (!data.ok) {
      const error = new Error(data.error ?? 'runtime error') as Error & {
        code?: string;
      };
      error.code = data.code;
      throw error;
    }
    return data.result as T;
  }

  readonly workspace: WorkspaceApi = {
    init: (input) => this.rpc(['workspace', 'init'], [input]),
    info: (cwd) => this.rpc(['workspace', 'info'], [cwd]),
  };

  readonly ai: AiApi = {
    add: (input) => this.rpc(['ai', 'add'], [input]),
    list: (cwd) => this.rpc(['ai', 'list'], [cwd]),
    info: (cwd, id) => this.rpc(['ai', 'info'], [cwd, id]),
    remove: (cwd, id) => this.rpc(['ai', 'remove'], [cwd, id]),
    health: (cwd, id) => this.rpc(['ai', 'health'], [cwd, id]),
    models: (cwd, id) => this.rpc(['ai', 'models'], [cwd, id]),
  };

  readonly modules: ModulesApi = {
    catalog: (cwd) => this.rpc(['modules', 'catalog'], [cwd]),
    list: (cwd) => this.rpc(['modules', 'list'], [cwd]),
    info: (cwd, id) => this.rpc(['modules', 'info'], [cwd, id]),
    plan: (cwd, id) => this.rpc(['modules', 'plan'], [cwd, id]),
    add: (cwd, id, withDependencies) =>
      this.rpc(['modules', 'add'], [cwd, id, withDependencies]),
    remove: (cwd, id) => this.rpc(['modules', 'remove'], [cwd, id]),
  };

  readonly integrations: IntegrationsApi = {
    catalog: (cwd) => this.rpc(['integrations', 'catalog'], [cwd]),
    list: (cwd) => this.rpc(['integrations', 'list'], [cwd]),
    info: (cwd, id) => this.rpc(['integrations', 'info'], [cwd, id]),
    add: (cwd, id, credentials) =>
      this.rpc(['integrations', 'add'], [cwd, id, credentials]),
    remove: (cwd, id) => this.rpc(['integrations', 'remove'], [cwd, id]),
    health: (cwd, id) => this.rpc(['integrations', 'health'], [cwd, id]),
  };

  readonly compose: ComposeApi = {
    generate: (cwd) => this.rpc(['compose', 'generate'], [cwd]),
    config: (cwd) => this.rpc(['compose', 'config'], [cwd]),
  };

  readonly runtime: RuntimeLifecycleApi = {
    up: (cwd) => this.rpc(['runtime', 'up'], [cwd]),
    down: (cwd) => this.rpc(['runtime', 'down'], [cwd]),
    restart: (cwd) => this.rpc(['runtime', 'restart'], [cwd]),
    // Streaming needs a local TTY — run against local docker directly.
    logs: (cwd, options) => this.local.runtime.logs(cwd, options),
    status: (cwd) => this.rpc(['runtime', 'status'], [cwd]),
  };

  validate = (cwd: string) => this.rpc<Awaited<ReturnType<RuntimeApi['validate']>>>(['validate'], [cwd]);
  health = (cwd: string) => this.rpc<Awaited<ReturnType<RuntimeApi['health']>>>(['health'], [cwd]);
}
