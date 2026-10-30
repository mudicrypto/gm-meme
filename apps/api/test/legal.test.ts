import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';

const app = (env: Record<string, string> = {}) =>
  buildApp(loadConfig({ LOG_LEVEL: 'silent', ALERT_CHECK_INTERVAL_MS: '0', ...env }), {
    helius: null,
  });

describe('public pages for the app stores', () => {
  it.each(['/privacy', '/terms', '/support'])('serves %s as a plain page', async (url) => {
    const server = app();
    const res = await server.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.body).not.toContain('<script');
    await server.close();
  });

  it('says what it keeps, that keys never reach Sift, and how to delete the account', async () => {
    const server = app();
    const body = (await server.inject({ method: 'GET', url: '/privacy' })).body;
    expect(body).toContain('never sees or stores the wallet');
    expect(body).toContain('Delete account');
    await server.close();
  });

  it('shows the configured contact and company, escaped', async () => {
    const server = app({ SUPPORT_EMAIL: 'help@example.com', OPERATOR_NAME: 'Sift <Labs> FZ' });
    const body = (await server.inject({ method: 'GET', url: '/terms' })).body;
    expect(body).toContain('mailto:help@example.com');
    expect(body).toContain('Sift &#60;Labs&#62; FZ');
    expect(body).toContain('0.5% of the trade');
    await server.close();
  });
});
