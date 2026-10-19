import { describe, expect, it, vi } from 'vitest';
import type { RiskService } from '../src/risk/service';
import type { SummaryModel } from '../src/summary/claude';
import { createSummaryService } from '../src/summary/service';
import { InMemoryTokenRepository } from '../src/tokens/memory-repository';
import { ALICE, BOB } from './fixtures/helius';
import { RISK_MINT } from './fixtures/risk';
import { silentLog } from './helpers/fake-helius';
import { riskScore } from './fixtures/summary';

const AI = {
  summary: 'Moon Cat is new. Checks found one issue. Its creator launched many tokens.',
  redFlags: ['Serial launcher'],
};

async function setup(model: SummaryModel | null, { known = true } = {}) {
  let clock = new Date('2026-10-19T12:00:00Z').getTime();
  const repository = new InMemoryTokenRepository();
  if (known) {
    await repository.upsertTokens([
      { mint: RISK_MINT, name: 'Moon Cat', symbol: 'MOON', launchedAt: '2026-10-19T11:00:00Z' },
    ]);
    await repository.recordSwaps([
      {
        signature: 's1',
        mint: RISK_MINT,
        trader: ALICE,
        volumeSol: 1,
        blockTime: '2026-10-19T11:30:00Z',
      },
      {
        signature: 's2',
        mint: RISK_MINT,
        trader: BOB,
        volumeSol: 2,
        blockTime: '2026-10-19T08:00:00Z',
      },
    ]);
  }
  const risk: RiskService = {
    getRisk: vi.fn(async (mint: string) => (mint === RISK_MINT ? riskScore() : null)),
  };
  const summary = createSummaryService({
    risk,
    repository,
    model,
    log: silentLog,
    now: () => new Date(clock),
  });
  return { summary, risk, advance: (ms: number) => (clock += ms) };
}

const fakeModel = (impl: SummaryModel['summarize']) => ({ summarize: vi.fn(impl) });

describe('summary service', () => {
  it('returns the AI summary with the risk level and disclaimer', async () => {
    const model = fakeModel(async () => AI);
    const { summary } = await setup(model);
    expect(await summary.getSummary(RISK_MINT)).toMatchObject({
      mint: RISK_MINT,
      summary: AI.summary,
      redFlags: AI.redFlags,
      riskLevel: 'red',
      source: 'ai',
      generatedAt: '2026-10-19T12:00:00.000Z',
      disclaimer: expect.stringContaining('not financial advice'),
    });
  });

  it('sends one hour and 24 hours of activity to the model', async () => {
    const model = fakeModel(async () => AI);
    await (await setup(model)).summary.getSummary(RISK_MINT);
    const message = model.summarize.mock.calls[0]![0];
    const data = JSON.parse(message.match(/<token_data>\n([\s\S]*)\n<\/token_data>/)![1]!);
    expect(data.trading_last_hour).toEqual({ trades: 1, distinct_traders: 1, volume_sol: 1 });
    expect(data.trading_last_24h).toEqual({ trades: 2, distinct_traders: 2, volume_sol: 3 });
  });

  it('is rules-based without an Anthropic key', async () => {
    const { summary } = await setup(null);
    const result = await summary.getSummary(RISK_MINT);
    expect(result).toMatchObject({ source: 'rules', riskLevel: 'red' });
    expect(result?.summary).toContain('Moon Cat had 1 trade from 1 wallet in the last hour.');
  });

  it('does not spend Claude calls on tokens Sift does not track', async () => {
    const model = fakeModel(async () => AI);
    const { summary } = await setup(model, { known: false });
    expect((await summary.getSummary(RISK_MINT))?.source).toBe('rules');
    expect(model.summarize).not.toHaveBeenCalled();
  });

  it.each([
    ['the model fails', async () => Promise.reject(new Error('overloaded'))],
    ['the model declines', async () => null],
    [
      'the answer reads as advice',
      async () => ({ summary: 'Strong buy. It will moon.', redFlags: [] }),
    ],
  ])('falls back to rules when %s, and retries after 30 seconds', async (_case, impl) => {
    const model = fakeModel(impl as SummaryModel['summarize']);
    const { summary, advance } = await setup(model);
    expect((await summary.getSummary(RISK_MINT))?.source).toBe('rules');
    advance(31_000);
    model.summarize.mockResolvedValue(AI);
    expect((await summary.getSummary(RISK_MINT))?.source).toBe('ai');
  });

  it('caches summaries for 5 minutes', async () => {
    const model = fakeModel(async () => AI);
    const { summary, advance } = await setup(model);
    await Promise.all([summary.getSummary(RISK_MINT), summary.getSummary(RISK_MINT)]);
    advance(4 * 60_000);
    await summary.getSummary(RISK_MINT);
    expect(model.summarize).toHaveBeenCalledTimes(1);
    advance(61_000);
    await summary.getSummary(RISK_MINT);
    expect(model.summarize).toHaveBeenCalledTimes(2);
  });

  it('returns null for an address that is not a mint', async () => {
    const model = fakeModel(async () => AI);
    const { summary } = await setup(model);
    expect(await summary.getSummary('So11111111111111111111111111111111111111112')).toBeNull();
    expect(model.summarize).not.toHaveBeenCalled();
  });
});
