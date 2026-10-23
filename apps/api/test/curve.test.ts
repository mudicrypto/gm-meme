import {
  type TradeQuote,
  base64ToBytes,
  curvePriceProblems,
  parseBondingCurve,
  pumpBondingCurveAddress,
  pumpVolumeAccumulatorAddress,
} from '@sift/shared';
import { PublicKey } from '@solana/web3.js';
import { describe, expect, it } from 'vitest';
import { pump } from '../src/trading/pump-sdk';
import fixture from './fixtures/devnet-bonding-curve.json';

const curve = parseBondingCurve(base64ToBytes(fixture.data))!;

describe('reading the pump.fun bonding curve on the phone', () => {
  it('derives the same addresses as the pump.fun SDK', () => {
    expect(pumpBondingCurveAddress(fixture.mint)).toBe(fixture.curve);
    const user = '6YcCaR7hSgW3NWgLYTf3wqE3vPs3tdKnJJEbiWBvaikr';
    expect(pumpVolumeAccumulatorAddress(user)).toBe(
      pump.userVolumeAccumulatorPda(new PublicKey(user)).toBase58(),
    );
  });

  it('decodes a real devnet curve exactly like the SDK', () => {
    expect(curve).toEqual({
      virtualTokenReserves: BigInt(fixture.decoded.vTok),
      virtualSolReserves: BigInt(fixture.decoded.vQuote),
      complete: fixture.decoded.complete,
      solQuoted: true,
      creatorFeeBps: Number(fixture.decoded.creatorFeeBps ?? 0),
    });
    expect(parseBondingCurve(new Uint8Array(200))).toBeNull(); // wrong discriminator
  });

  // pump.fun's constant-product price, with its fee (about 1.25%) taken out.
  const sellGross = (tokens: bigint) =>
    (tokens * curve.virtualSolReserves) / (curve.virtualTokenReserves + tokens);
  const buyTokens = (lamports: bigint) =>
    (lamports * curve.virtualTokenReserves) / (curve.virtualSolReserves + lamports);
  const quote = (q: Partial<TradeQuote>) => ({ side: 'sell', ...q }) as TradeQuote;

  it('accepts honest quotes and refuses ones well below the on-chain price', () => {
    const tokens = 10_000_000_000n;
    const honestSale = (sellGross(tokens) * 98_75n) / 100_00n;
    expect(
      curvePriceProblems(
        quote({ tokenAmount: `${tokens}`, expectedLamports: Number(honestSale) }),
        curve,
      ),
    ).toEqual([]);
    const lowball = (sellGross(tokens) * 90n) / 100n;
    expect(
      curvePriceProblems(
        quote({ tokenAmount: `${tokens}`, expectedLamports: Number(lowball) }),
        curve,
      ),
    ).toEqual(['the quote pays less SOL than the price on chain']);

    const sol = 10_000_000n;
    const honestBuy = buyTokens((sol * 98_75n) / 100_00n);
    expect(
      curvePriceProblems(
        quote({ side: 'buy', expectedLamports: Number(sol), tokenAmount: `${honestBuy}` }),
        curve,
      ),
    ).toEqual([]);
    const fewTokens = (buyTokens(sol) * 90n) / 100n;
    expect(
      curvePriceProblems(
        quote({ side: 'buy', expectedLamports: Number(sol), tokenAmount: `${fewTokens}` }),
        curve,
      ),
    ).toEqual(['the quote gives fewer tokens than the price on chain']);
  });

  it('refuses a finished curve or one priced in another token', () => {
    const q = quote({ tokenAmount: '1', expectedLamports: 1 });
    expect(curvePriceProblems(q, { ...curve, complete: true })).toHaveLength(1);
    expect(curvePriceProblems(q, { ...curve, solQuoted: false })).toHaveLength(1);
  });
});
