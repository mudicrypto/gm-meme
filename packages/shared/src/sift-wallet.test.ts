import { describe, expect, it } from 'vitest';
import {
  type CreateOrderRequest,
  DEFAULT_PER_ORDER_LAMPORTS,
  describeOrder,
  effectiveTrigger,
  orderProgress,
  orderRequestProblems,
  orderSummary,
  orderTriggered,
  protectPreset,
  sellFloor,
} from './sift-wallet';

const stop = { kind: 'stop_loss' as const, triggerPriceSol: 0.8, slippageBps: 1000 };

describe('orderTriggered', () => {
  it('fires stops and limit buys at or below the trigger, take-profits at or above', () => {
    expect(orderTriggered(stop, 0.81)).toBe(false);
    expect(orderTriggered(stop, 0.8)).toBe(true);
    expect(orderTriggered({ kind: 'limit_buy', triggerPriceSol: 0.5 }, 0.49)).toBe(true);
    expect(orderTriggered({ kind: 'limit_buy', triggerPriceSol: 0.5 }, 0.51)).toBe(false);
    expect(orderTriggered({ kind: 'take_profit', triggerPriceSol: 2 }, 1.99)).toBe(false);
    expect(orderTriggered({ kind: 'take_profit', triggerPriceSol: 2 }, 2)).toBe(true);
  });

  it('moves a trailing stop up with the peak, never below its start', () => {
    const trailing = { ...stop, trailingPct: 20, peakPriceSol: 2 };
    expect(effectiveTrigger(trailing)).toBeCloseTo(1.6);
    expect(orderTriggered(trailing, 1.7)).toBe(false);
    expect(orderTriggered(trailing, 1.6)).toBe(true);
    expect(effectiveTrigger({ ...stop, trailingPct: 20, peakPriceSol: 0.9 })).toBe(0.8);
  });
});

describe('sellFloor and orderProgress', () => {
  it('sets the stop-limit floor at the trigger minus slippage', () => {
    expect(sellFloor(stop)).toBeCloseTo(0.72);
  });

  it('measures the distance to the trigger', () => {
    expect(orderProgress(stop, 1)).toEqual({ pctAway: expect.closeTo(20), fill: 80 });
    expect(orderProgress({ kind: 'take_profit', triggerPriceSol: 2 }, 1)?.fill).toBe(50);
    expect(orderProgress(stop, 0.7)?.fill).toBe(100);
    expect(orderProgress(stop, undefined)).toBeNull();
  });
});

describe('order text', () => {
  it('describes each kind in one line', () => {
    expect(describeOrder({ ...stop, sellPercent: 100 })).toBe(
      'Sell 100% if price falls to 0.8 SOL',
    );
    expect(describeOrder({ kind: 'take_profit', triggerPriceSol: 2, sellPercent: 50 })).toBe(
      'Sell 50% when price reaches 2 SOL',
    );
    expect(
      describeOrder({ kind: 'limit_buy', triggerPriceSol: 0.5, buyLamports: 500_000_000 }),
    ).toBe('Buy with 0.5 SOL if price drops to 0.5 SOL');
  });

  it('says plainly that a stop may not sell in a crash', () => {
    const text = orderSummary({ ...stop, symbol: 'MOON', currentPriceSol: 1, sellPercent: 100 });
    expect(text).toContain('falls to 0.8 SOL (-20%)');
    expect(text).toContain('may not sell');
    expect(text).not.toMatch(/\b(safe|should|recommend)\b/i);
  });
});

describe('protectPreset', () => {
  it('sells all at -30% and half when it doubles', () => {
    expect(protectPreset(1)).toEqual([
      { kind: 'stop_loss', triggerPriceSol: 0.7, sellPercent: 100 },
      { kind: 'take_profit', triggerPriceSol: 2, sellPercent: 50 },
    ]);
  });
});

describe('orderRequestProblems', () => {
  const ok: CreateOrderRequest = {
    mint: 'x',
    kind: 'stop_loss',
    triggerPriceSol: 0.8,
    sellPercent: 100,
    slippageBps: 1000,
    expiresInDays: 7,
  };
  const limits = { perOrderLamports: DEFAULT_PER_ORDER_LAMPORTS };

  it('accepts a sensible order', () => {
    expect(orderRequestProblems(ok, limits)).toEqual([]);
  });

  it('refuses bad values and limit breaches', () => {
    expect(orderRequestProblems({ ...ok, triggerPriceSol: 0 }, limits)).toHaveLength(1);
    expect(orderRequestProblems({ ...ok, sellPercent: 150 }, limits)).toHaveLength(1);
    expect(orderRequestProblems({ ...ok, expiresInDays: 60 }, limits)).toHaveLength(1);
    expect(orderRequestProblems({ ...ok, slippageBps: 5000 }, limits)).toHaveLength(1);
    expect(
      orderRequestProblems(
        { ...ok, kind: 'limit_buy', sellPercent: undefined, buyLamports: 2_000_000_000 },
        limits,
      ),
    ).toEqual(["That's above your per-order limit of 1 SOL."]);
    expect(orderRequestProblems({ ...ok, kind: 'take_profit', trailing: true }, limits)).toEqual([
      'Only stop losses can trail.',
    ]);
  });
});
