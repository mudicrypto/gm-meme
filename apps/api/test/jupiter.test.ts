import { WSOL_MINT } from '@sift/shared';
import { describe, expect, it, vi } from 'vitest';
import { JupiterError, createJupiterClient } from '../src/risk/jupiter';
import { MINT_A } from './fixtures/helius';

const BASE = 'https://lite-api.jup.ag/swap/v1';

function client(status: number, body: unknown, apiKey?: string) {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));
  return { fetch, jupiter: createJupiterClient({ baseUrl: BASE, apiKey, fetch }) };
}

// Shape of a real lite-api quote (trimmed).
const quote = {
  inputMint: MINT_A,
  inAmount: '1000000',
  outputMint: WSOL_MINT,
  outAmount: '9537679',
  priceImpactPct: '0.0123',
  routePlan: [
    { swapInfo: { label: 'Meteora DLMM', ammKey: 'x' }, percent: 60 },
    { swapInfo: { label: 'Raydium', ammKey: 'y' }, percent: 40 },
    { swapInfo: { label: 'Meteora DLMM', ammKey: 'z' }, percent: 100 },
  ],
};

describe('Jupiter quoteSell', () => {
  it('quotes selling the token for SOL and converts impact to a percentage', async () => {
    const { fetch, jupiter } = client(200, quote);
    expect(await jupiter.quoteSell(MINT_A, 1_000_000n)).toEqual({
      status: 'quoted',
      priceImpactPct: 1.23,
      routes: ['Meteora DLMM', 'Raydium'],
    });
    const url = new URL(fetch.mock.calls[0]![0] as string);
    expect(url.origin + url.pathname).toBe(`${BASE}/quote`);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      inputMint: MINT_A,
      outputMint: WSOL_MINT,
      amount: '1000000',
    });
  });

  it.each([
    ['an impact that is not a number', { ...quote, priceImpactPct: 'abc' }],
    ['an empty impact', { ...quote, priceImpactPct: '' }],
    ['a route with no steps', { ...quote, routePlan: [] }],
  ])('throws on %s, so the check says "couldn\'t test" rather than green', async (_name, body) => {
    const { jupiter } = client(200, body);
    await expect(jupiter.quoteSell(MINT_A, 1_000_000n)).rejects.toThrow();
  });

  it('reports a token Jupiter cannot sell as no route', async () => {
    const { jupiter } = client(400, {
      error: `The token ${MINT_A} is not tradable`,
      errorCode: 'TOKEN_NOT_TRADABLE',
    });
    expect(await jupiter.quoteSell(MINT_A, 1n)).toEqual({
      status: 'no_route',
      reason: 'not tradable',
    });
  });

  it('reports a missing route as no route', async () => {
    const { jupiter } = client(400, {
      error: 'No routes found',
      errorCode: 'COULD_NOT_FIND_ANY_ROUTE',
    });
    expect(await jupiter.quoteSell(MINT_A, 1n)).toEqual({
      status: 'no_route',
      reason: 'no route found',
    });
  });

  it('throws on other failures, so the check says "couldn\'t test" instead of "no route"', async () => {
    await expect(
      client(429, { error: 'Rate limited' }).jupiter.quoteSell(MINT_A, 1n),
    ).rejects.toThrow(JupiterError);
    await expect(
      client(400, { errorCode: 'INVALID_AMOUNT' }).jupiter.quoteSell(MINT_A, 1n),
    ).rejects.toThrow('INVALID_AMOUNT');
  });

  it('sends the API key when one is configured', async () => {
    const { fetch, jupiter } = client(200, quote, 'jup-key');
    await jupiter.quoteSell(MINT_A, 1n);
    expect(fetch.mock.calls[0]![1]!.headers).toEqual({ 'x-api-key': 'jup-key' });
  });
});
