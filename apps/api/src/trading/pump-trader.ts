import { type Connection, PublicKey, type TransactionInstruction } from '@solana/web3.js';
import type BN from 'bn.js';
import { TradeError } from './errors';
import { type BondingCurve, type FeeConfig, type Global, pump } from './pump-sdk';

/** A pump.fun bonding-curve trade, ready to put in a transaction. */
export interface PumpTrade {
  instructions: TransactionInstruction[];
  /** Buy: tokens received. Sell: tokens sold. Base units. */
  tokenAmount: BN;
  /** Buy: expected SOL into the curve. Sell: expected SOL out. */
  expectedLamports: BN;
  /** Buy: max SOL into the curve. Sell: min SOL out. */
  limitLamports: BN;
  tokenProgram: PublicKey;
  decimals: number;
  /** A first buy opens the user's token account (rent paid by the user). */
  createsTokenAccount: boolean;
  /** Byte sizes of every account this trade creates and the user pays rent for. */
  newAccountSpaces: number[];
  priceImpactPct: number | null;
}

export interface PumpTrader {
  buildBuy(args: {
    mint: string;
    user: string;
    solLamports: BN;
    slippageBps: number;
  }): Promise<PumpTrade>;
  buildSell(args: {
    mint: string;
    user: string;
    tokenAmount: BN;
    slippageBps: number;
  }): Promise<PumpTrade>;
}

const GLOBAL_TTL_MS = 60_000;
// Rent-exempt sizes of accounts a buy may open for the user. Token-2022 accounts carry an
// extra extension; the volume tracker size was read from a real devnet account.
const TOKEN_ACCOUNT_SPACE = { spl: 165, token2022: 170 } as const;
const USER_VOLUME_ACCUMULATOR_SPACE = 137;
const TOKEN_2022 = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
// Offset of `decimals` in an SPL / Token-2022 mint account.
const MINT_DECIMALS_OFFSET = 44;

export function createPumpTrader(connection: Connection): PumpTrader {
  const sdk = new pump.OnlinePumpSdk(connection);
  let cached: { at: number; global: Global; feeConfig: FeeConfig | null } | undefined;

  async function config() {
    if (cached && Date.now() - cached.at < GLOBAL_TTL_MS) return cached;
    const [global, feeConfig] = await Promise.all([
      sdk.fetchGlobal(),
      sdk.fetchFeeConfig().catch(() => null),
    ]);
    cached = { at: Date.now(), global, feeConfig };
    return cached;
  }

  async function mintInfo(mint: PublicKey) {
    const account = await connection.getAccountInfo(mint);
    if (!account || account.data.length <= MINT_DECIMALS_OFFSET) {
      throw new TradeError('NOT_PUMP_TOKEN', 'This address is not a token.');
    }
    return { tokenProgram: account.owner, decimals: account.data[MINT_DECIMALS_OFFSET]! };
  }

  function assertTradable(curve: BondingCurve, quoteMint: PublicKey) {
    if (!pump.isSolLikeQuoteMint(quoteMint)) {
      throw new TradeError(
        'NOT_PUMP_TOKEN',
        'This token is priced in another token rather than SOL, which Sift can’t trade yet.',
      );
    }
    if (curve.complete) {
      throw new TradeError(
        'CURVE_COMPLETE',
        "This token has left pump.fun's bonding curve for a trading pool. Sift trades pool tokens through Jupiter, which turns on with mainnet.",
      );
    }
  }

  async function loadState<T>(load: () => Promise<T>): Promise<T> {
    try {
      return await load();
    } catch {
      throw new TradeError(
        'NOT_PUMP_TOKEN',
        'This token is not on pump.fun, so Sift can’t trade it yet.',
      );
    }
  }

  return {
    async buildBuy({ mint, user, solLamports, slippageBps }) {
      const mintKey = new PublicKey(mint);
      const userKey = new PublicKey(user);
      const [{ global, feeConfig }, { tokenProgram, decimals }] = await Promise.all([
        config(),
        mintInfo(mintKey),
      ]);
      const [state, volumeAccumulator] = await Promise.all([
        loadState(() => sdk.fetchBuyState(mintKey, userKey, tokenProgram)),
        connection.getAccountInfo(pump.userVolumeAccumulatorPda(userKey)),
      ]);
      assertTradable(state.bondingCurve, state.quoteMint);

      // Accounts this buy opens for the user, whose rent the user pays on top of the budget.
      const newAccountSpaces: number[] = [];
      if (state.associatedUserAccountInfo === null) {
        newAccountSpaces.push(
          tokenProgram.equals(TOKEN_2022) ? TOKEN_ACCOUNT_SPACE.token2022 : TOKEN_ACCOUNT_SPACE.spl,
        );
      }
      // pump.fun opens a per-wallet volume tracker on a wallet's first ever buy.
      if (volumeAccumulator === null) newAccountSpaces.push(USER_VOLUME_ACCUMULATOR_SPACE);

      const tokenAmount = pump.getBuyTokenAmountFromSolAmount({
        global,
        feeConfig,
        mintSupply: state.bondingCurve.tokenTotalSupply,
        bondingCurve: state.bondingCurve,
        amount: solLamports,
        quoteMint: state.quoteMint,
        quoteTransferFee: state.quoteTransferFee,
      });
      if (tokenAmount.isZero())
        throw new TradeError('AMOUNT_TOO_SMALL', 'That amount is too small to buy anything.');

      const slippagePct = slippageBps / 100;
      const instructions = await pump.PUMP_SDK.buyInstructions({
        global,
        bondingCurveAccountInfo: state.bondingCurveAccountInfo,
        bondingCurve: state.bondingCurve,
        associatedUserAccountInfo: state.associatedUserAccountInfo,
        mint: mintKey,
        user: userKey,
        amount: tokenAmount,
        solAmount: solLamports,
        slippage: slippagePct,
        tokenProgram,
      });

      return {
        instructions,
        tokenAmount,
        expectedLamports: solLamports,
        // Mirrors the SDK: max_sol_cost = sol + sol × floor(slippage × 10) / 1000.
        limitLamports: solLamports.add(solLamports.muln(Math.floor(slippagePct * 10)).divn(1000)),
        tokenProgram,
        decimals,
        createsTokenAccount: state.associatedUserAccountInfo === null,
        newAccountSpaces,
        priceImpactPct: impact(state.bondingCurve, solLamports, tokenAmount, 'buy'),
      };
    },

    async buildSell({ mint, user, tokenAmount, slippageBps }) {
      const mintKey = new PublicKey(mint);
      const userKey = new PublicKey(user);
      const [{ global, feeConfig }, { tokenProgram, decimals }] = await Promise.all([
        config(),
        mintInfo(mintKey),
      ]);
      const state = await loadState(() => sdk.fetchSellState(mintKey, userKey, tokenProgram));
      assertTradable(state.bondingCurve, state.quoteMint);

      const expected = pump.getSellSolAmountFromTokenAmount({
        global,
        feeConfig,
        mintSupply: state.bondingCurve.tokenTotalSupply,
        bondingCurve: state.bondingCurve,
        amount: tokenAmount,
        quoteTransferFee: state.quoteTransferFee,
      });
      if (expected.isZero())
        throw new TradeError('AMOUNT_TOO_SMALL', 'That amount is too small to sell.');

      const slippagePct = slippageBps / 100;
      const instructions = await pump.PUMP_SDK.sellInstructions({
        global,
        bondingCurveAccountInfo: state.bondingCurveAccountInfo,
        bondingCurve: state.bondingCurve,
        mint: mintKey,
        user: userKey,
        amount: tokenAmount,
        solAmount: expected,
        slippage: slippagePct,
        tokenProgram,
        mayhemMode: state.bondingCurve.isMayhemMode,
        cashback: state.bondingCurve.isCashbackCoin,
      });

      return {
        instructions,
        tokenAmount,
        expectedLamports: expected,
        // Mirrors the SDK: min_sol_output = sol − sol × floor(slippage × 10) / 1000.
        limitLamports: expected.sub(expected.muln(Math.floor(slippagePct * 10)).divn(1000)),
        tokenProgram,
        decimals,
        createsTokenAccount: false,
        newAccountSpaces: [],
        priceImpactPct: impact(state.bondingCurve, expected, tokenAmount, 'sell'),
      };
    },
  };
}

/** Fill price vs the curve's current spot price, as a percentage (fees included). */
function impact(
  curve: BondingCurve,
  lamports: BN,
  tokens: BN,
  side: 'buy' | 'sell',
): number | null {
  if (curve.virtualTokenReserves.isZero() || tokens.isZero()) return null;
  const spot =
    Number(curve.virtualQuoteReserves.toString()) / Number(curve.virtualTokenReserves.toString());
  const fill = Number(lamports.toString()) / Number(tokens.toString());
  if (!(spot > 0)) return null;
  const pct = side === 'buy' ? (fill / spot - 1) * 100 : (1 - fill / spot) * 100;
  return Math.round(pct * 100) / 100;
}
