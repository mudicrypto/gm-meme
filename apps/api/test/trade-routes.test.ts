import type { TradeQuote, TradeQuoteRequest } from '@sift/shared';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { TradeError } from '../src/trading/errors';
import type { TradeService } from '../src/trading/service';
import { InMemoryTokenRepository } from '../src/tokens/memory-repository';
import { MINT_A, addr } from './fixtures/helius';
import { fakeHelius } from './helpers/fake-helius';

const WALLET = addr('Wa11et');
const FEE = addr('FeeWa11et');

function setup(trades: TradeService | null, env: Record<string, string> = {}) {
  const airdrop = vi.fn(async () => 'airdropsig');
  const app = buildApp(loadConfig({ LOG_LEVEL: 'silent', FEE_WALLET: FEE, ...env }), {
    tokenRepository: new InMemoryTokenRepository(),
    helius: fakeHelius(),
    jupiter: null,
    summaryModel: null,
    tradeService: trades,
    airdrop,
  });
  return { app, airdrop };
}

const fakeTrades = () => ({
  // Routes pass the quote through untouched, so its contents don't matter here.
  quote: vi.fn(async (_request: TradeQuoteRequest) => ({ quoteId: 'q' }) as unknown as TradeQuote),
  submit: vi.fn(async (_quoteId: string, _tx: string) => 'sig'),
  status: vi.fn(async (signature: string) => ({ signature, status: 'confirmed' as const })),
});

describe('trade routes', () => {
  const trades = fakeTrades();
  const { app, airdrop } = setup(trades);
  afterAll(() => app.close());
  const quote = (body: object) =>
    app.inject({ method: 'POST', url: '/trades/quote', payload: body });
  const valid = { mint: MINT_A, wallet: WALLET, side: 'buy', amount: '10000000', slippageBps: 500 };

  it('publishes cluster, fee and fee wallet for the app', async () => {
    const res = await app.inject({ method: 'GET', url: '/config' });
    expect(res.json()).toEqual({
      cluster: 'devnet',
      trading: { enabled: true, platformFeeBps: 50, feeWallet: FEE },
    });
  });

  it('passes a valid quote request through', async () => {
    expect((await quote(valid)).statusCode).toBe(200);
    expect(trades.quote).toHaveBeenCalledWith(valid);
  });

  it.each([
    ['a bad mint', { mint: 'nope' }],
    ['a bad wallet', { wallet: 'nope' }],
    ['a negative amount', { amount: '-1' }],
    ['a decimal amount', { amount: '1.5' }],
    ['a dust buy', { amount: '1000' }],
    ['a huge buy', { amount: '1000000000000' }],
    ['tiny slippage', { slippageBps: 1 }],
    ['50%+ slippage', { slippageBps: 6000 }],
    ['an unknown side', { side: 'short' }],
  ])('rejects %s with 400', async (_name, change) => {
    expect((await quote({ ...valid, ...change })).statusCode).toBe(400);
  });

  it('turns trade problems into a 422 the app can show', async () => {
    trades.quote.mockRejectedValueOnce(new TradeError('INSUFFICIENT_SOL', 'Not enough SOL.'));
    const res = await quote(valid);
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({
      error: 'Unprocessable Entity',
      code: 'INSUFFICIENT_SOL',
      message: 'Not enough SOL.',
    });
  });

  it('validates submissions and reports status', async () => {
    const bad = await app.inject({
      method: 'POST',
      url: '/trades/submit',
      payload: { quoteId: 'x', transaction: 'y' },
    });
    expect(bad.statusCode).toBe(400);
    const ok = await app.inject({
      method: 'POST',
      url: '/trades/submit',
      payload: { quoteId: 'a'.repeat(32), transaction: 'A'.repeat(200) },
    });
    expect(ok.json()).toEqual({ signature: 'sig' });
    const status = await app.inject({ method: 'GET', url: `/trades/${'5'.repeat(88)}` });
    expect(status.json()).toEqual({ signature: '5'.repeat(88), status: 'confirmed' });
  });

  it('gives devnet SOL at most once per wallet every 10 minutes', async () => {
    const first = await app.inject({ method: 'POST', url: `/wallets/${WALLET}/airdrop` });
    expect(first.json()).toEqual({ signature: 'airdropsig' });
    expect(
      (await app.inject({ method: 'POST', url: `/wallets/${WALLET}/airdrop` })).statusCode,
    ).toBe(429);
    expect(airdrop).toHaveBeenCalledTimes(1);
  });
});

describe('trading switches', () => {
  it('is disabled on mainnet until ALLOW_MAINNET_TRADING is set', async () => {
    const { app } = setup(null, { SOLANA_CLUSTER: 'mainnet-beta' });
    const res = await app.inject({ method: 'POST', url: '/trades/quote', payload: {} });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: 'TRADING_DISABLED' });
    expect((await app.inject({ method: 'GET', url: '/config' })).json()).toMatchObject({
      trading: { enabled: false },
    });
    expect(
      (await app.inject({ method: 'POST', url: `/wallets/${WALLET}/airdrop` })).statusCode,
    ).toBe(404);
    await app.close();
  });

  it('charges no fee without a fee wallet', async () => {
    const { app } = setup(fakeTrades(), { FEE_WALLET: '' });
    expect((await app.inject({ method: 'GET', url: '/config' })).json()).toMatchObject({
      trading: { platformFeeBps: 0, feeWallet: null },
    });
    await app.close();
  });

  it('rejects a fee above 1% and a fee wallet that is not an address', () => {
    expect(() => loadConfig({ PLATFORM_FEE_BPS: '150' })).toThrow(/PLATFORM_FEE_BPS/);
    expect(() => loadConfig({ FEE_WALLET: 'my-wallet' })).toThrow(/FEE_WALLET/);
  });
});

describe('fee wallet default', () => {
  it("uses Sift's fee wallet unless overridden", () => {
    expect(loadConfig({}).FEE_WALLET).toBe('9x6aHFQawRisd1JfPLNHwDHJU4HwHNqb5x5p6TEGHrtc');
    expect(loadConfig({ FEE_WALLET: FEE }).FEE_WALLET).toBe(FEE);
    expect(loadConfig({ FEE_WALLET: '' }).FEE_WALLET).toBeUndefined();
  });
});
