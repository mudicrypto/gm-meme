import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { InMemorySocialRepository } from '../src/social/memory-repository';
import { InMemoryTokenRepository } from '../src/tokens/memory-repository';
import { ALICE } from './fixtures/helius';

function setup(env: Record<string, string> = {}) {
  return buildApp(loadConfig({ LOG_LEVEL: 'silent', ALERT_CHECK_INTERVAL_MS: '0', ...env }), {
    tokenRepository: new InMemoryTokenRepository(),
    socialRepository: new InMemorySocialRepository(),
    push: null,
    helius: null,
  });
}

const challenge = (app: ReturnType<typeof setup>, extra: object = {}) =>
  app.inject({ method: 'POST', url: '/auth/challenge', payload: { wallet: ALICE }, ...extra });

describe('rate limits', () => {
  it('limits expensive routes per IP, with a plain message', async () => {
    const app = setup();
    for (let i = 0; i < 10; i++) expect((await challenge(app)).statusCode).toBe(200);
    const limited = await challenge(app);
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({
      error: 'Too Many Requests',
      message: 'Too many requests. Wait a minute and try again.',
    });
    // Another IP has its own allowance.
    expect((await challenge(app, { remoteAddress: '203.0.113.9' })).statusCode).toBe(200);
    await app.close();
  });

  it('applies the general limit to other routes, but never to health checks', async () => {
    const app = setup({ RATE_LIMIT_PER_MINUTE: '3' });
    for (let i = 0; i < 3; i++) {
      expect((await app.inject({ method: 'GET', url: '/tokens/new' })).statusCode).toBe(200);
    }
    expect((await app.inject({ method: 'GET', url: '/tokens/new' })).statusCode).toBe(429);
    for (let i = 0; i < 10; i++) {
      expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    }
    await app.close();
  });

  it('ignores X-Forwarded-For unless proxies are configured', async () => {
    const spoof = (app: ReturnType<typeof setup>, ip: string) =>
      challenge(app, { headers: { 'x-forwarded-for': ip } });

    const direct = setup();
    for (let i = 0; i < 10; i++) await spoof(direct, `198.51.100.${i}`);
    // A client can't dodge the limit by inventing a forwarded address.
    expect((await spoof(direct, '198.51.100.99')).statusCode).toBe(429);
    await direct.close();

    const behindProxy = setup({ TRUST_PROXY_HOPS: '1' });
    for (let i = 0; i < 11; i++) {
      expect((await spoof(behindProxy, `198.51.100.${i}`)).statusCode).toBe(200);
    }
    await behindProxy.close();
  });
});
