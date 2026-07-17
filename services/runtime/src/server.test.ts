import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from './server';

describe('runtime server', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
  });

  it('reports health', async () => {
    app = buildServer();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', name: 'relay-runtime' });
  });

  it('rejects an RPC path outside the allowed namespaces (prototype safety)', async () => {
    app = buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/rpc',
      payload: { path: ['__proto__', 'x'], args: [] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().ok).toBe(false);
  });

  it('rejects an unknown method on an allowed namespace', async () => {
    app = buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/rpc',
      payload: { path: ['ai', 'destroyEverything'], args: [] },
    });
    expect(res.statusCode).toBe(404);
  });
});
