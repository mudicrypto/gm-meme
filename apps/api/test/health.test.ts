import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';

describe('GET /health', () => {
  const app = buildApp(loadConfig({ LOG_LEVEL: 'silent' }));
  afterAll(() => app.close());

  it('reports ok and the cluster', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', cluster: 'devnet' });
  });

  it('returns 404 for unknown routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
  });
});
