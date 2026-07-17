import Fastify, { type FastifyInstance } from 'fastify';
import { InProcessClient } from '@relay/runtime-client';

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

  app.get('/health', () => ({
    status: 'ok',
    name: 'relay-runtime',
    version: '0.1.0',
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
  const app = buildServer();
  await app.listen({ host: '127.0.0.1', port });
  return app;
}
