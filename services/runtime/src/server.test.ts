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

  it('allows the desktop origin (browsers need CORS to read the response)', async () => {
    app = buildServer();
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://localhost:1420' },
    });
    expect(res.headers['access-control-allow-origin']).toBe(
      'http://localhost:1420',
    );
  });

  it('answers the preflight the browser sends before a JSON /rpc POST', async () => {
    app = buildServer();
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/rpc',
      headers: {
        origin: 'tauri://localhost',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    expect(res.statusCode).toBeLessThan(300);
    expect(res.headers['access-control-allow-origin']).toBe('tauri://localhost');
  });

  it('does NOT allow a random website to drive the daemon', async () => {
    app = buildServer();
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://evil.example.com' },
    });
    // No ACAO header -> the browser blocks the response.
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
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
