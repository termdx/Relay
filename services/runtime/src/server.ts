import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { InProcessClient } from '@relay/runtime-client';
import {
  defaultWorkspaceRoot,
  ensureDefaultWorkspace,
} from '@relay/runtime-core';

/**
 * Origins allowed to call the daemon from a browser context: the desktop app
 * (Tauri's custom protocol) and its Vite dev server.
 *
 * Deliberately an allowlist, NOT `origin: true`. This daemon can mutate the
 * workspace and drive Docker, and it listens on loopback — reflecting any
 * origin would let any website the user visits drive their runtime. An
 * allowlist also blocks DNS-rebinding, since the attacker's Origin won't match.
 * Extra origins can be added via RELAY_CORS_ORIGINS (comma-separated).
 */
const DEFAULT_ORIGINS = [
  'http://localhost:1420',
  'http://127.0.0.1:1420',
  'tauri://localhost',
  'http://tauri.localhost',
];

function allowedOrigins(): Set<string> {
  const extra = (process.env.RELAY_CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ORIGINS, ...extra]);
}

/** Top-level RuntimeApi namespaces (and bare methods) callable over RPC. */
const ALLOWED = new Set([
  'workspace',
  'ai',
  'modules',
  'integrations',
  'workflows',
  'agents',
  'compose',
  'runtime',
  'validate',
  'health',
]);

interface RpcBody {
  path?: unknown;
  args?: unknown;
}

/**
 * The Runtime API daemon. A thin HTTP wrapper over the in-process client:
 * a single /rpc endpoint dispatches to the same RuntimeApi surface, so the
 * daemon and every other client stay in lockstep by construction. Bind to
 * loopback only — this is a local control plane.
 */
export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: false });
  const client = new InProcessClient();
  const origins = allowedOrigins();

  // Registered without await: Fastify loads plugins on ready()/listen().
  void app.register(cors, {
    origin: (origin, cb) => {
      // Non-browser callers (curl, the CLI) send no Origin — allow those.
      if (!origin) return cb(null, true);
      cb(null, origins.has(origin));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['content-type', 'x-relay-token'],
  });

  // Remote deployments set RELAY_RUNTIME_TOKEN: every request except /health
  // must present it. Locally (no token set) the daemon stays loopback-open.
  const runtimeToken = process.env.RELAY_RUNTIME_TOKEN;
  if (runtimeToken) {
    app.addHook('onRequest', (request, reply, done) => {
      if (request.url === '/health' || request.method === 'OPTIONS') {
        return done();
      }
      if (request.headers['x-relay-token'] !== runtimeToken) {
        reply.code(401).send({ ok: false, error: 'runtime token required' });
        return;
      }
      done();
    });
  }

  // Clients read `workspace` from here rather than sending a relative path —
  // the daemon owns a well-known location, not whatever cwd it was started in.
  app.get('/health', () => ({
    status: 'ok',
    name: 'relay-runtime',
    version: '0.1.0',
    workspace: defaultWorkspaceRoot(),
  }));

  app.post('/rpc', async (request, reply) => {
    const { path, args } = (request.body ?? {}) as RpcBody;
    const callArgs = Array.isArray(args) ? args : [];

    if (
      !Array.isArray(path) ||
      path.length === 0 ||
      path.length > 2 ||
      typeof path[0] !== 'string' ||
      !ALLOWED.has(path[0]) ||
      path.some((p) => typeof p !== 'string')
    ) {
      reply.code(400);
      return { ok: false, error: 'invalid method path' };
    }

    let target: unknown = client;
    for (const key of path as string[]) {
      target = (target as Record<string, unknown> | undefined)?.[key];
    }
    if (typeof target !== 'function') {
      reply.code(404);
      return { ok: false, error: `unknown method: ${(path as string[]).join('.')}` };
    }

    try {
      const result = await (target as (...a: unknown[]) => Promise<unknown>)(
        ...callArgs,
      );
      console.log(`[rpc] ${(path as string[]).join('.')} ok`);
      return { ok: true, result };
    } catch (error) {
      const err = error as { message?: string; code?: string };
      console.log(`[rpc] ${(path as string[]).join('.')} error: ${err.message}`);
      return { ok: false, error: err.message ?? String(error), code: err.code };
    }
  });

  return app;
}

export async function startRuntimeServer(port: number): Promise<FastifyInstance> {
  // Guarantee there is always a workspace to serve, so a fresh install needs
  // no `relay init` before the desktop works.
  const { root, created } = await ensureDefaultWorkspace();
  console.log(
    `${created ? 'created' : 'using'} default workspace: ${root}`,
  );

  const app = buildServer();
  await app.listen({ host: '127.0.0.1', port });
  return app;
}
