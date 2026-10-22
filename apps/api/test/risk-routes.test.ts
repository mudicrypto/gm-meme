import type { RiskScore, TokenExplanation } from '@sift/shared';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app';
import { pumpBondingCurve } from '../src/risk/gather';
import { loadConfig } from '../src/config';
import { InMemoryTokenRepository } from '../src/tokens/memory-repository';
import { addr } from './fixtures/helius';
import { RISK_MINT, cleanMint, pct } from './fixtures/risk';
import { fakeHelius } from './helpers/fake-helius';

describe('GET /tokens/:mint/risk', () => {
  const helius = fakeHelius();
  helius.getMint.mockImplementation(async (mint) =>
    mint === RISK_MINT ? cleanMint({ mintAuthority: addr('Dev') }) : null,
  );
  helius.getLargestTokenAccounts.mockImplementation(async (mint) => [
    {
      owner: pumpBondingCurve(mint),
      ownerProgram: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
      amount: pct(90),
    },
  ]);
  const app = buildApp(loadConfig({ LOG_LEVEL: 'silent' }), {
    tokenRepository: new InMemoryTokenRepository(),
    helius,
    jupiter: null,
  });
  afterAll(() => app.close());

  it('returns the score with reasons, most severe first', async () => {
    const res = await app.inject({ method: 'GET', url: `/tokens/${RISK_MINT}/risk` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=30');
    const body = res.json<RiskScore>();
    expect(body.level).toBe('red');
    expect(body.reasons[0]).toMatchObject({ check: 'mint_authority', level: 'red' });
    expect(body.reasons).toHaveLength(7);
    expect(body.disclaimer).toContain('not financial advice');
  });

  it('rejects an address that is not base58', async () => {
    const res = await app.inject({ method: 'GET', url: '/tokens/not-a-mint!/risk' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for an address that is not a mint', async () => {
    const res = await app.inject({ method: 'GET', url: `/tokens/${addr('Nobody')}/risk` });
    expect(res.statusCode).toBe(404);
  });
});

describe('risk route without Helius', () => {
  it('is not registered', async () => {
    const app = buildApp(loadConfig({ LOG_LEVEL: 'silent' }), { helius: null });
    expect((await app.inject({ method: 'GET', url: `/tokens/${RISK_MINT}/risk` })).statusCode).toBe(
      404,
    );
    await app.close();
  });
});

describe('GET /tokens/:mint/summary', () => {
  const helius = fakeHelius();
  helius.getMint.mockImplementation(async (mint) => (mint === RISK_MINT ? cleanMint() : null));
  const repository = new InMemoryTokenRepository();
  const summarize = vi.fn(async () => ({
    summary: 'One. Two. Three.',
    redFlags: ['Thin trading'],
  }));
  const app = buildApp(loadConfig({ LOG_LEVEL: 'silent' }), {
    tokenRepository: repository,
    helius,
    jupiter: null,
    summaryModel: { summarize },
  });
  afterAll(() => app.close());

  it('explains a tracked token with AI', async () => {
    await repository.upsertTokens([{ mint: RISK_MINT, name: 'Moon Cat' }]);
    const res = await app.inject({ method: 'GET', url: `/tokens/${RISK_MINT}/summary` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=60');
    expect(res.json<TokenExplanation>()).toMatchObject({
      source: 'ai',
      summary: 'One. Two. Three.',
      redFlags: ['Thin trading'],
    });
  });

  it('validates the address and 404s for non-mints', async () => {
    expect((await app.inject({ method: 'GET', url: '/tokens/bad!/summary' })).statusCode).toBe(400);
    expect(
      (await app.inject({ method: 'GET', url: `/tokens/${addr('Nobody')}/summary` })).statusCode,
    ).toBe(404);
  });
});
