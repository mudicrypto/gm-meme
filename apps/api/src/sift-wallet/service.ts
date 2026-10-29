import { randomUUID } from 'node:crypto';
import {
  type CreateOrderRequest,
  DEFAULT_DAILY_LAMPORTS,
  DEFAULT_PER_ORDER_LAMPORTS,
  type FeedToken,
  LAMPORTS_PER_SOL,
  MAX_OPEN_ORDERS,
  type SiftOrder,
  type SiftWalletInfo,
  type TradeQuote,
  WITHDRAWAL_HOLD_MS,
  base64ToBytes,
  isSolanaAddress,
  orderRequestProblems,
  orderTriggered,
  sellFloor,
  verifyTradeTransaction,
} from '@sift/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { TokenRepository } from '../tokens/repository';
import { TradeError } from '../trading/errors';
import type { TradeService } from '../trading/service';
import { WITHDRAWAL_FEE_LAMPORTS, type WalletChain } from './chain';
import type { OrderRecord, SiftWalletRepository, WalletRecord } from './repository';
import { SignerError, type WalletSigner } from './signer';
import { newTotpSecret, totpUri, verifyTotp } from './totp';
import { withdrawalProblems } from './verify-withdrawal';

export class SiftWalletError extends Error {
  override name = 'SiftWalletError';
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

// Ceilings a user can raise their own caps to while Sift is on devnet.
export const MAX_PER_ORDER_LAMPORTS = 10 * LAMPORTS_PER_SOL;
export const MAX_DAILY_LAMPORTS = 50 * LAMPORTS_PER_SOL;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 3;

export type Notify = (owner: string, title: string, body: string) => Promise<void>;

export interface SiftWalletDeps {
  repo: SiftWalletRepository;
  /** Null: no signing provider configured, so no Sift wallets. */
  signer: WalletSigner | null;
  trades: TradeService | null;
  chain: WalletChain | null;
  tokens: TokenRepository;
  feeWallet: string | null;
  platformFeeBps: number;
  /** Emergency switch: nothing is signed while this is on. */
  signingFrozen: boolean;
  notify?: Notify;
  log?: Pick<FastifyBaseLogger, 'error' | 'warn'>;
  now: () => Date;
}

export type SiftWalletService = ReturnType<typeof createSiftWalletService>;

export function createSiftWalletService(deps: SiftWalletDeps) {
  const { repo, now } = deps;
  const live = () => deps.signer !== null && deps.trades !== null && deps.chain !== null;

  function signingState(): SiftWalletInfo['signing'] {
    if (!live()) return 'not_configured';
    return deps.signingFrozen ? 'paused' : 'live';
  }

  async function walletOf(owner: string): Promise<WalletRecord> {
    const wallet = await repo.getWallet(owner);
    if (!wallet) throw new SiftWalletError(404, 'NO_WALLET', 'Create your Sift wallet first.');
    return wallet;
  }

  function requireSigning(wallet: WalletRecord) {
    if (!live())
      throw new SiftWalletError(
        503,
        'NOT_CONFIGURED',
        'The Sift wallet is not set up on this server yet.',
      );
    if (deps.signingFrozen)
      throw new SiftWalletError(
        503,
        'PAUSED',
        'Sift has paused all signing for now. Your funds are untouched.',
      );
    if (wallet.frozen)
      throw new SiftWalletError(423, 'FROZEN', 'Your Sift wallet is frozen. Unfreeze it first.');
  }

  // Wrong 2FA codes per owner: after 5 in 15 minutes, codes are refused until it passes.
  const failures = new Map<string, number[]>();
  function checkCode(owner: string, secret: string, code: string | undefined): boolean {
    const at = now().getTime();
    const recent = (failures.get(owner) ?? []).filter((t) => at - t < 15 * 60_000);
    if (recent.length >= 5)
      throw new SiftWalletError(
        429,
        'TOO_MANY_CODES',
        'Too many wrong codes. Wait 15 minutes and try again.',
      );
    if (code && verifyTotp(secret, code, now())) {
      failures.delete(owner);
      return true;
    }
    failures.set(owner, [...recent, at]);
    if (failures.size > 10_000) failures.delete(failures.keys().next().value!);
    return false;
  }

  function requireCode(wallet: WalletRecord, code: string | undefined) {
    if (!wallet.totpEnabled || !wallet.totpSecret)
      throw new SiftWalletError(409, 'NO_2FA', 'Turn on two-factor codes first.');
    if (!checkCode(wallet.owner, wallet.totpSecret, code))
      throw new SiftWalletError(
        401,
        'BAD_CODE',
        'That code is wrong or expired. Try the current one.',
      );
  }

  async function info(wallet: WalletRecord): Promise<SiftWalletInfo> {
    const used = await repo.spentSince(
      wallet.owner,
      new Date(now().getTime() - DAY_MS).toISOString(),
    );
    return {
      address: wallet.address,
      frozen: wallet.frozen,
      signing: signingState(),
      limits: {
        perOrderLamports: wallet.perOrderLamports,
        dailyLamports: wallet.dailyLamports,
        usedTodayLamports: used,
      },
      withdrawal: { address: wallet.withdrawAddress, readyAt: wallet.withdrawReadyAt },
      twoFactor: { enabled: wallet.totpEnabled },
    };
  }

  const recipients = (wallet: Pick<WalletRecord, 'withdrawAddress'>) =>
    [deps.feeWallet, wallet.withdrawAddress].filter((a): a is string => Boolean(a));

  const fields = (wallet: WalletRecord) => ({
    frozen: wallet.frozen,
    perOrderLamports: wallet.perOrderLamports,
    dailyLamports: wallet.dailyLamports,
    withdrawAddress: wallet.withdrawAddress,
    withdrawReadyAt: wallet.withdrawReadyAt,
    totpSecret: wallet.totpSecret,
    totpEnabled: wallet.totpEnabled,
  });

  async function save(wallet: WalletRecord) {
    await repo.updateWallet(wallet.owner, fields(wallet));
    return info(wallet);
  }

  async function notify(owner: string, title: string, body: string) {
    try {
      await deps.notify?.(owner, title, body);
    } catch (err) {
      deps.log?.error({ err }, 'could not send Sift wallet notification');
    }
  }

  async function tokenInfo(mint: string): Promise<FeedToken> {
    const token = await deps.tokens.getToken(mint);
    return {
      mint,
      ...(token?.symbol ? { symbol: token.symbol } : {}),
      ...(token?.name ? { name: token.name } : {}),
      ...(token?.imageUrl ? { imageUrl: token.imageUrl } : {}),
      ...(token?.riskLevel ? { riskLevel: token.riskLevel } : {}),
    };
  }

  /**
   * Sign and send one of Sift's own quotes from the Sift wallet, after the same checks the
   * phone runs and the user's caps. Returns the signature.
   */
  async function signQuote(wallet: WalletRecord, quote: TradeQuote): Promise<string> {
    requireSigning(wallet);
    if (quote.wallet !== wallet.address)
      throw new SiftWalletError(400, 'WRONG_WALLET', 'That quote is not for your Sift wallet.');
    if (quote.side === 'buy') {
      if (quote.worstCaseLamports > wallet.perOrderLamports)
        throw new SiftWalletError(
          422,
          'OVER_LIMIT',
          `This buy can cost up to ${sol(quote.worstCaseLamports)} SOL, above your per-order limit of ${sol(wallet.perOrderLamports)} SOL.`,
        );
      const used = await repo.spentSince(
        wallet.owner,
        new Date(now().getTime() - DAY_MS).toISOString(),
      );
      if (used + quote.worstCaseLamports > wallet.dailyLamports)
        throw new SiftWalletError(
          422,
          'OVER_DAILY_LIMIT',
          `This would pass your daily limit of ${sol(wallet.dailyLamports)} SOL (${sol(used)} SOL used in the last 24 hours).`,
        );
    }
    // The same verifier the phone runs: one signer, known programs, fee to Sift's wallet,
    // slippage limit and totals consistent with the quote.
    const check = verifyTradeTransaction(
      base64ToBytes(quote.transaction),
      quote,
      deps.feeWallet,
      deps.platformFeeBps,
    );
    if (!check.ok) {
      deps.log?.error({ problems: check.problems }, 'refused to sign a Sift wallet trade');
      throw new SiftWalletError(
        422,
        'CHECK_FAILED',
        'This trade failed Sift’s safety checks, so it was not signed.',
      );
    }
    const signed = await deps.signer!.signTransaction(wallet.providerId, quote.transaction);
    const signature = await deps.trades!.submit(quote.quoteId, signed);
    if (quote.side === 'buy') {
      await repo.recordSpend(wallet.owner, quote.worstCaseLamports, now().toISOString());
    }
    return signature;
  }

  function toOrder(record: OrderRecord, token: FeedToken): SiftOrder {
    const { owner: _owner, mint: _mint, attempts: _attempts, ...rest } = record;
    return { ...rest, token };
  }

  async function execute(order: OrderRecord, price: number): Promise<void> {
    const wallet = await repo.getWallet(order.owner);
    if (!wallet) return;
    if (!(await repo.claimOrder(order.id))) return;
    const token = await tokenInfo(order.mint);
    const name = token.symbol ?? token.name ?? 'your token';
    try {
      if (order.kind === 'limit_buy' && token.riskLevel === 'red')
        throw new SiftWalletError(
          422,
          'RED_TOKEN',
          'Sift now rates this token red, so the automatic buy was stopped.',
        );
      let amount: string;
      if (order.kind === 'limit_buy') {
        amount = String(order.buyLamports ?? 0);
      } else {
        const balance = await deps.chain!.tokenBalance(wallet.address, order.mint);
        if (!balance)
          throw new SiftWalletError(409, 'NOTHING_TO_SELL', `Your Sift wallet holds no ${name}.`);
        amount = ((BigInt(balance.amountRaw) * BigInt(order.sellPercent ?? 100)) / 100n).toString();
        if (amount === '0')
          throw new SiftWalletError(409, 'NOTHING_TO_SELL', `Your Sift wallet holds no ${name}.`);
      }
      const quote = await deps.trades!.quote({
        mint: order.mint,
        wallet: wallet.address,
        side: order.kind === 'limit_buy' ? 'buy' : 'sell',
        amount,
        slippageBps: order.slippageBps,
      });
      const signature = await signQuote(wallet, quote);
      await repo.settleOrder(order.id, {
        status: 'filled',
        signature,
        filledAt: now().toISOString(),
        message: `Filled near ${Number(price.toPrecision(3))} SOL.`,
      });
      await notify(
        order.owner,
        `${orderVerb(order)} ${name}`,
        `Your ${orderName(order)} ran at about ${Number(price.toPrecision(3))} SOL. You set this order in Sift.`,
      );
    } catch (err) {
      const message = reason(err);
      const retry =
        order.attempts + 1 < MAX_ATTEMPTS &&
        !(
          err instanceof SiftWalletError &&
          ['RED_TOKEN', 'NOTHING_TO_SELL', 'FROZEN'].includes(err.code)
        );
      if (!(err instanceof SiftWalletError || err instanceof TradeError))
        deps.log?.error({ err, order: order.id }, 'order execution failed');
      await repo.settleOrder(order.id, {
        status: retry ? 'open' : 'failed',
        message: retry ? `Tried to run but couldn’t: ${message} Sift will try again.` : message,
      });
      if (!retry) await notify(order.owner, `${name} order didn’t run`, message);
    }
  }

  return {
    signingState,

    async get(owner: string): Promise<SiftWalletInfo | null> {
      const wallet = await repo.getWallet(owner);
      return wallet ? info(wallet) : null;
    },

    async create(owner: string): Promise<SiftWalletInfo> {
      const existing = await repo.getWallet(owner);
      if (existing) return info(existing);
      if (!deps.signer)
        throw new SiftWalletError(
          503,
          'NOT_CONFIGURED',
          'The Sift wallet is not set up on this server yet.',
        );
      const created = await deps.signer.createWallet({
        allowedRecipients: recipients({ withdrawAddress: null }),
      });
      const wallet = await repo.insertWallet({
        owner,
        providerId: created.providerId,
        address: created.address,
        frozen: false,
        perOrderLamports: DEFAULT_PER_ORDER_LAMPORTS,
        dailyLamports: DEFAULT_DAILY_LAMPORTS,
        withdrawAddress: null,
        withdrawReadyAt: null,
        totpSecret: null,
        totpEnabled: false,
        createdAt: now().toISOString(),
      });
      return info(wallet);
    },

    async setLimits(
      owner: string,
      limits: { perOrderLamports: number; dailyLamports: number },
      code?: string,
    ) {
      const wallet = await walletOf(owner);
      if (limits.perOrderLamports > limits.dailyLamports)
        throw new SiftWalletError(
          400,
          'BAD_LIMITS',
          'The per-order limit can’t be above the daily limit.',
        );
      if (
        limits.perOrderLamports > MAX_PER_ORDER_LAMPORTS ||
        limits.dailyLamports > MAX_DAILY_LAMPORTS
      )
        throw new SiftWalletError(
          400,
          'BAD_LIMITS',
          'During testing, limits go up to 10 SOL per order and 50 SOL a day.',
        );
      // Lowering is always allowed; raising needs a 2FA code.
      if (
        limits.perOrderLamports > wallet.perOrderLamports ||
        limits.dailyLamports > wallet.dailyLamports
      )
        requireCode(wallet, code);
      return save({ ...wallet, ...limits });
    },

    async freeze(owner: string) {
      const wallet = await walletOf(owner);
      const result = await save({ ...wallet, frozen: true });
      await notify(owner, 'Sift wallet frozen', 'Nothing will be signed until you unfreeze it.');
      return result;
    },

    async unfreeze(owner: string, code?: string) {
      const wallet = await walletOf(owner);
      if (wallet.totpEnabled) requireCode(wallet, code);
      return save({ ...wallet, frozen: false });
    },

    /** Start 2FA set-up: a new secret for the authenticator app (not on until confirmed). */
    async startTwoFactor(owner: string) {
      const wallet = await walletOf(owner);
      if (wallet.totpEnabled)
        throw new SiftWalletError(409, 'HAS_2FA', 'Two-factor codes are already on.');
      const secret = newTotpSecret();
      await repo.updateWallet(owner, { ...fields(wallet), totpSecret: secret });
      return { secret, uri: totpUri(secret, wallet.address) };
    },

    async confirmTwoFactor(owner: string, code: string) {
      const wallet = await walletOf(owner);
      if (wallet.totpEnabled)
        throw new SiftWalletError(409, 'HAS_2FA', 'Two-factor codes are already on.');
      if (!wallet.totpSecret || !checkCode(owner, wallet.totpSecret, code))
        throw new SiftWalletError(
          401,
          'BAD_CODE',
          'That code is wrong or expired. Try the current one.',
        );
      const hold = new Date(now().getTime() + WITHDRAWAL_HOLD_MS).toISOString();
      const result = await save({
        ...wallet,
        totpEnabled: true,
        // A 2FA change starts the 24-hour wait on withdrawals.
        withdrawReadyAt: wallet.withdrawAddress ? hold : wallet.withdrawReadyAt,
      });
      await notify(
        owner,
        'Two-factor codes on',
        'Your Sift wallet now needs a code for withdrawals and key export.',
      );
      return result;
    },

    async setWithdrawalAddress(owner: string, address: string, code?: string) {
      const wallet = await walletOf(owner);
      requireCode(wallet, code);
      if (!isSolanaAddress(address) || address === wallet.address)
        throw new SiftWalletError(400, 'BAD_ADDRESS', 'Enter another Solana wallet address.');
      if (deps.signer)
        await deps.signer.setAllowedRecipients(
          wallet.providerId,
          recipients({ withdrawAddress: address }),
        );
      const result = await save({
        ...wallet,
        withdrawAddress: address,
        withdrawReadyAt: new Date(now().getTime() + WITHDRAWAL_HOLD_MS).toISOString(),
      });
      await notify(
        owner,
        'New withdrawal address',
        `Withdrawals to ${address.slice(0, 4)}…${address.slice(-4)} open in 24 hours. Not you? Freeze your Sift wallet in the app.`,
      );
      return result;
    },

    async withdraw(owner: string, lamports: number, code?: string) {
      const wallet = await walletOf(owner);
      requireSigning(wallet);
      requireCode(wallet, code);
      if (!wallet.withdrawAddress)
        throw new SiftWalletError(409, 'NO_ADDRESS', 'Save a withdrawal address first.');
      if (!wallet.withdrawReadyAt || Date.parse(wallet.withdrawReadyAt) > now().getTime())
        throw new SiftWalletError(
          423,
          'ON_HOLD',
          'Withdrawals open 24 hours after a new address or 2FA change.',
        );
      const balance = await deps.chain!.solBalance(wallet.address);
      if (
        !Number.isInteger(lamports) ||
        lamports <= 0 ||
        lamports + WITHDRAWAL_FEE_LAMPORTS > balance
      )
        throw new SiftWalletError(
          422,
          'BAD_AMOUNT',
          `You can withdraw up to ${sol(Math.max(0, balance - WITHDRAWAL_FEE_LAMPORTS))} SOL.`,
        );
      const tx = await deps.chain!.buildTransfer(wallet.address, wallet.withdrawAddress, lamports);
      const problems = withdrawalProblems(tx, {
        from: wallet.address,
        to: wallet.withdrawAddress,
        lamports,
      });
      if (problems.length > 0) {
        deps.log?.error({ problems }, 'refused to sign a withdrawal');
        throw new SiftWalletError(
          422,
          'CHECK_FAILED',
          'This withdrawal failed Sift’s checks, so it was not signed.',
        );
      }
      const signed = await deps.signer!.signTransaction(wallet.providerId, tx);
      const signature = await deps.chain!.sendSigned(signed);
      await notify(
        owner,
        'Withdrawal sent',
        `${sol(lamports)} SOL is on its way to your saved address.`,
      );
      return { signature };
    },

    async exportKey(owner: string, code: string | undefined, recipientPublicKey: string) {
      const wallet = await walletOf(owner);
      requireCode(wallet, code);
      if (!live())
        throw new SiftWalletError(
          503,
          'NOT_CONFIGURED',
          'The Sift wallet is not set up on this server yet.',
        );
      const encrypted = await deps.signer!.exportKey(wallet.providerId, recipientPublicKey);
      await notify(
        owner,
        'Sift wallet key exported',
        'Your private key was shown on your phone. Not you? Freeze your wallet now.',
      );
      return encrypted;
    },

    /** A manual trade the user reviewed on the phone, signed from the Sift wallet. */
    async trade(owner: string, quoteId: string) {
      const wallet = await walletOf(owner);
      const quote = deps.trades?.issuedQuote(quoteId);
      if (!quote)
        throw new SiftWalletError(
          404,
          'QUOTE_NOT_FOUND',
          'This quote has expired. Review the trade again.',
        );
      return { signature: await signQuote(wallet, quote) };
    },

    async placeOrders(owner: string, requests: CreateOrderRequest[], group?: string) {
      const wallet = await walletOf(owner);
      requireSigning(wallet);
      if ((await repo.countOpen(owner)) + requests.length > MAX_OPEN_ORDERS)
        throw new SiftWalletError(
          409,
          'TOO_MANY',
          `You can have up to ${MAX_OPEN_ORDERS} open orders.`,
        );
      for (const request of requests) {
        const problems = orderRequestProblems(request, wallet);
        if (problems.length > 0) throw new SiftWalletError(400, 'BAD_ORDER', problems.join(' '));
        if (
          request.kind === 'limit_buy' &&
          (await deps.tokens.getToken(request.mint))?.riskLevel === 'red'
        )
          throw new SiftWalletError(
            422,
            'RED_TOKEN',
            'Sift rates this token red, so it can’t be bought automatically.',
          );
      }
      const prices = await deps.tokens.getLatestPrices([...new Set(requests.map((r) => r.mint))]);
      const trailing = (request: CreateOrderRequest) => {
        const price = prices.get(request.mint);
        if (!price || request.triggerPriceSol >= price)
          throw new SiftWalletError(
            400,
            'BAD_ORDER',
            'A trailing stop must start below the current price.',
          );
        return { trailingPct: (1 - request.triggerPriceSol / price) * 100, peakPriceSol: price };
      };
      const created = now();
      const records: OrderRecord[] = requests.map((request) => ({
        id: randomUUID(),
        owner,
        mint: request.mint,
        kind: request.kind,
        triggerPriceSol: request.triggerPriceSol,
        ...(request.kind === 'limit_buy'
          ? { buyLamports: request.buyLamports! }
          : { sellPercent: request.sellPercent! }),
        ...(request.trailing ? trailing(request) : {}),
        slippageBps: request.slippageBps,
        status: 'open',
        ...(group ? { group } : {}),
        attempts: 0,
        createdAt: created.toISOString(),
        expiresAt: new Date(created.getTime() + request.expiresInDays * DAY_MS).toISOString(),
      }));
      for (const record of records) await repo.insertOrder(record);
      const token = await tokenInfo(records[0]!.mint);
      return records.map((record) => toOrder(record, token));
    },

    async orders(owner: string): Promise<SiftOrder[]> {
      const records = await repo.ordersOf(owner, 100);
      const tokens = new Map<string, FeedToken>();
      for (const mint of new Set(records.map((r) => r.mint)))
        tokens.set(mint, await tokenInfo(mint));
      return records.map((record) => toOrder(record, tokens.get(record.mint)!));
    },

    async cancelOrder(owner: string, id: string) {
      if (!(await repo.cancelOrder(owner, id)))
        throw new SiftWalletError(404, 'NOT_FOUND', 'That order isn’t open any more.');
    },

    /** One pass of the order engine: expire, follow trailing stops, run triggered orders. */
    async runOrders(): Promise<{ executed: number }> {
      const expired = await repo.expireOrders(now().toISOString());
      for (const order of expired) {
        await notify(
          order.owner,
          'Order expired',
          `Your ${orderName(order)} expired without running.`,
        );
      }
      if (!live() || deps.signingFrozen) return { executed: 0 };
      const open = await repo.openOrders();
      if (open.length === 0) return { executed: 0 };
      const prices = await deps.tokens.getLatestPrices([...new Set(open.map((o) => o.mint))]);
      let executed = 0;
      for (const order of open) {
        const price = prices.get(order.mint);
        if (price === undefined) continue;
        if (order.trailingPct && price > (order.peakPriceSol ?? 0)) {
          await repo.touchOrder(order.id, { peakPriceSol: price });
          order.peakPriceSol = price;
        }
        if (!orderTriggered(order, price)) continue;
        // A stop-limit: if the price gapped below the floor, wait instead of dumping.
        if (order.kind === 'stop_loss' && price < sellFloor(order)) {
          const waiting = `The price gapped below your limit of ${Number(sellFloor(order).toPrecision(3))} SOL, so the order is waiting.`;
          if (order.message !== waiting) await repo.touchOrder(order.id, { message: waiting });
          continue;
        }
        await execute(order, price);
        executed += 1;
      }
      return { executed };
    },
  };
}

function orderName(order: Pick<OrderRecord, 'kind'>): string {
  return order.kind === 'limit_buy'
    ? 'limit buy'
    : order.kind === 'stop_loss'
      ? 'stop loss'
      : 'take profit';
}

function orderVerb(order: Pick<OrderRecord, 'kind'>): string {
  return order.kind === 'limit_buy' ? 'Bought' : 'Sold';
}

function sol(lamports: number): string {
  return Number((lamports / LAMPORTS_PER_SOL).toPrecision(4)).toString();
}

function reason(err: unknown): string {
  if (err instanceof SiftWalletError || err instanceof TradeError) return err.message;
  if (err instanceof SignerError) return 'The signing service refused or was unreachable.';
  return 'Something went wrong on Sift’s side.';
}
