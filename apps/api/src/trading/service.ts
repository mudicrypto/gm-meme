import { randomBytes } from 'node:crypto';
import {
  LAMPORTS_PER_SOL,
  PUMP_PROGRAM,
  type TradeQuote,
  type TradeQuoteRequest,
  type TradeStatusResponse,
  base64ToBytes,
  bytesToBase64,
  decodeTransaction,
  solanaKeys,
  verifyTradeTransaction,
} from '@sift/shared';
import {
  ComputeBudgetProgram,
  type Connection,
  PublicKey,
  SystemProgram,
  type TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import BN from 'bn.js';
import type { FastifyBaseLogger } from 'fastify';
import { TradeError } from './errors';
import type { PumpTrade, PumpTrader } from './pump-trader';

export interface TradeService {
  quote(request: TradeQuoteRequest): Promise<TradeQuote>;
  /** Relay a quote's transaction once the user has signed it. Returns the signature. */
  submit(quoteId: string, signedTransaction: string): Promise<string>;
  status(signature: string): Promise<TradeStatusResponse>;
}

/** A trade Sift relayed that the network confirmed. */
export interface ConfirmedTrade {
  signature: string;
  wallet: string;
  mint: string;
  side: 'buy' | 'sell';
  /** SOL into the curve (buy) or out of it (sell), as quoted. */
  solLamports: number;
  /** Base units. */
  tokenAmount: string;
  tokenDecimals: number;
  at: string;
}

export interface TradeServiceOptions {
  connection: Connection;
  pump: PumpTrader;
  estimatePriorityFee: (programId: string) => Promise<number>;
  /** Null disables the platform fee. */
  feeWallet: string | null;
  platformFeeBps: number;
  log?: Pick<FastifyBaseLogger, 'error'>;
  now?: () => Date;
  /** How long a quote can be signed and submitted; blockhashes expire after ~60–90s. */
  quoteTtlMs?: number;
  /** Called once a relayed trade confirms (for the friends feed). Off when unset. */
  onConfirmed?: (trade: ConfirmedTrade) => Promise<void> | void;
  /** Wait between confirmation checks; injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const SIGNATURE_FEE_LAMPORTS = 5000;
const SIMULATION_COMPUTE_UNITS = 400_000;
const MIN_COMPUTE_UNITS = 60_000;

interface IssuedQuote {
  message: Uint8Array;
  wallet: string;
  expiresAt: number;
  trade: Omit<ConfirmedTrade, 'signature' | 'at'>;
}

const CONFIRM_POLL_MS = 2000;
const CONFIRM_POLLS = 45;

export function createTradeService(options: TradeServiceOptions): TradeService {
  const now = options.now ?? (() => new Date());
  const ttlMs = options.quoteTtlMs ?? 75_000;
  const issued = new Map<string, IssuedQuote>();
  const { connection } = options;
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  // Follow a relayed trade until it confirms or fails, then report it once.
  async function watchConfirmation(signature: string, trade: IssuedQuote['trade']) {
    const onConfirmed = options.onConfirmed;
    if (!onConfirmed) return;
    try {
      for (let i = 0; i < CONFIRM_POLLS; i++) {
        await sleep(CONFIRM_POLL_MS);
        const { value } = await connection.getSignatureStatuses([signature]);
        const status = value[0];
        if (!status || status.confirmationStatus === 'processed') continue;
        if (status.err) return;
        await onConfirmed({ ...trade, signature, at: now().toISOString() });
        return;
      }
    } catch (err) {
      options.log?.error({ err, signature }, 'could not follow trade confirmation');
    }
  }

  // Solana won't create an account below the rent-exempt minimum, so while the fee wallet
  // is empty, a small fee transfer would make every trade fail. Until it's funded we charge
  // no fee (and the quote says so) rather than block users over a setup mistake.
  let feeWalletFunded = false;
  let feeWalletCheckedAt = -Infinity;
  async function feeBpsNow(): Promise<number> {
    if (!options.feeWallet || options.platformFeeBps === 0) return 0;
    if (!feeWalletFunded && now().getTime() - feeWalletCheckedAt > 60_000) {
      feeWalletCheckedAt = now().getTime();
      const [balance, minimum] = await Promise.all([
        connection.getBalance(new PublicKey(options.feeWallet)),
        connection.getMinimumBalanceForRentExemption(0),
      ]);
      feeWalletFunded = balance >= minimum;
      if (!feeWalletFunded) {
        options.log?.error(
          { feeWallet: options.feeWallet, balance, minimum },
          'FEE_WALLET holds less than the rent-exempt minimum: fund it with at least 0.001 SOL. Charging no fee until then.',
        );
      }
    }
    return feeWalletFunded ? options.platformFeeBps : 0;
  }

  function prune() {
    const at = now().getTime();
    for (const [id, quote] of issued) if (quote.expiresAt <= at) issued.delete(id);
  }

  function compile(
    user: PublicKey,
    blockhash: string,
    units: number,
    microLamports: number,
    ixs: TransactionInstruction[],
  ) {
    const message = new TransactionMessage({
      payerKey: user,
      recentBlockhash: blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports }),
        ...ixs,
      ],
    }).compileToV0Message();
    return new VersionedTransaction(message);
  }

  async function simulate(tx: VersionedTransaction): Promise<number> {
    const { value } = await connection.simulateTransaction(tx, {
      sigVerify: false,
      replaceRecentBlockhash: true,
    });
    if (value.err) {
      throw new TradeError(
        'SIMULATION_FAILED',
        `This trade would fail: ${explain(value.logs ?? [], value.err)}`,
      );
    }
    return value.unitsConsumed ?? SIMULATION_COMPUTE_UNITS;
  }

  return {
    async quote(request) {
      const user = new PublicKey(request.wallet);
      const amount = new BN(request.amount);
      const feeBps = await feeBpsNow();
      const platformFee = (lamports: BN) => lamports.muln(feeBps).divn(10_000);

      // The fee comes out of a buy budget, and out of the guaranteed minimum of a sell.
      let trade: PumpTrade;
      let platformLamports: BN;
      if (request.side === 'buy') {
        platformLamports = platformFee(amount);
        trade = await options.pump.buildBuy({
          mint: request.mint,
          user: request.wallet,
          solLamports: amount.sub(platformLamports),
          slippageBps: request.slippageBps,
        });
      } else {
        trade = await options.pump.buildSell({
          mint: request.mint,
          user: request.wallet,
          tokenAmount: amount,
          slippageBps: request.slippageBps,
        });
        platformLamports = platformFee(trade.limitLamports);
      }

      const instructions = [...trade.instructions];
      if (!platformLamports.isZero() && options.feeWallet) {
        instructions.push(
          SystemProgram.transfer({
            fromPubkey: user,
            toPubkey: new PublicKey(options.feeWallet),
            lamports: BigInt(platformLamports.toString()),
          }),
        );
      }

      const microLamports = await options.estimatePriorityFee(PUMP_PROGRAM);
      const [{ blockhash }, balance, rents] = await Promise.all([
        connection.getLatestBlockhash('confirmed'),
        connection.getBalance(user),
        Promise.all(
          trade.newAccountSpaces.map((space) =>
            connection.getMinimumBalanceForRentExemption(space),
          ),
        ),
      ]);
      const rent = rents.reduce((total, lamports) => total + lamports, 0);
      // Before simulating: a wallet that never held SOL doesn't exist on chain, and the
      // simulation would only say "AccountNotFound".
      if (balance === 0) {
        throw new TradeError(
          'INSUFFICIENT_SOL',
          'This wallet has no SOL yet. Add some to pay for the trade and network fees.',
        );
      }

      // Simulate with room to spare, then size the compute limit (and so the priority
      // fee) to what the trade actually uses.
      const units = Math.max(
        MIN_COMPUTE_UNITS,
        Math.ceil(
          (await simulate(
            compile(user, blockhash, SIMULATION_COMPUTE_UNITS, microLamports, instructions),
          )) * 1.2,
        ),
      );
      const tx = compile(user, blockhash, units, microLamports, instructions);

      const fees = {
        platformLamports: Number(platformLamports.toString()),
        platformBps: feeBps,
        priorityLamports: Math.ceil((units * microLamports) / 1_000_000),
        networkLamports: SIGNATURE_FEE_LAMPORTS,
        accountRentLamports: rent,
      };
      const otherFees = fees.platformLamports + fees.priorityLamports + fees.networkLamports;
      const expected = Number(trade.expectedLamports.toString());
      const limit = Number(trade.limitLamports.toString());
      const isBuy = request.side === 'buy';
      const quote: TradeQuote = {
        quoteId: randomBytes(16).toString('hex'),
        transaction: bytesToBase64(tx.serialize()),
        expiresAt: new Date(now().getTime() + ttlMs).toISOString(),
        side: request.side,
        mint: request.mint,
        wallet: request.wallet,
        venue: 'pump.fun',
        tokenAmount: trade.tokenAmount.toString(),
        tokenDecimals: trade.decimals,
        expectedLamports: expected,
        limitLamports: limit,
        slippageBps: request.slippageBps,
        priceImpactPct: trade.priceImpactPct,
        fees,
        expectedTotalLamports: isBuy ? expected + otherFees + rent : expected - otherFees,
        worstCaseLamports: isBuy ? limit + otherFees + rent : limit - otherFees,
      };

      if (isBuy && balance < quote.worstCaseLamports) {
        throw new TradeError(
          'INSUFFICIENT_SOL',
          `Not enough SOL: this buy can cost up to ${sol(quote.worstCaseLamports)} SOL including fees, and the wallet has ${sol(balance)} SOL.`,
        );
      }
      if (!isBuy && balance < otherFees) {
        throw new TradeError(
          'INSUFFICIENT_SOL',
          `Not enough SOL to pay the ${sol(otherFees)} SOL in fees.`,
        );
      }

      // We build it, so it must pass the same check the app runs before signing.
      const check = verifyTradeTransaction(tx.serialize(), quote, options.feeWallet);
      if (!check.ok)
        throw new Error(`built a trade that fails verification: ${check.problems.join('; ')}`);

      prune();
      issued.set(quote.quoteId, {
        message: tx.message.serialize(),
        wallet: request.wallet,
        expiresAt: now().getTime() + ttlMs,
        trade: {
          wallet: request.wallet,
          mint: request.mint,
          side: request.side,
          solLamports: expected,
          tokenAmount: quote.tokenAmount,
          tokenDecimals: quote.tokenDecimals,
        },
      });
      return quote;
    },

    async submit(quoteId, signedTransaction) {
      prune();
      const quote = issued.get(quoteId);
      if (!quote) {
        throw new TradeError(
          'QUOTE_NOT_FOUND',
          'This quote has expired. Review the trade again to get a fresh price.',
        );
      }
      let bytes: Uint8Array;
      let decoded: ReturnType<typeof decodeTransaction>;
      try {
        bytes = base64ToBytes(signedTransaction);
        decoded = decodeTransaction(bytes);
      } catch {
        throw new TradeError('TRANSACTION_MISMATCH', 'That is not a valid transaction.');
      }
      // Only relay exactly what we issued: no open relay, no modified transactions.
      if (!equalBytes(decoded.message, quote.message)) {
        throw new TradeError(
          'TRANSACTION_MISMATCH',
          'The signed transaction does not match the quote.',
        );
      }
      const signature = decoded.signatures[0];
      if (!signature || !solanaKeys.verify(signature, decoded.message, quote.wallet)) {
        throw new TradeError(
          'BAD_SIGNATURE',
          'The transaction is not signed by the quoted wallet.',
        );
      }

      issued.delete(quoteId);
      try {
        const sent = await connection.sendRawTransaction(bytes, {
          skipPreflight: false,
          maxRetries: 3,
        });
        void watchConfirmation(sent, quote.trade);
        return sent;
      } catch (err) {
        throw new TradeError(
          'SEND_FAILED',
          `The network rejected the trade: ${short((err as Error).message)}`,
        );
      }
    },

    async status(signature) {
      const { value } = await connection.getSignatureStatuses([signature], {
        searchTransactionHistory: true,
      });
      const status = value[0];
      if (!status) return { signature, status: 'pending' };
      if (status.err) return { signature, status: 'failed', error: JSON.stringify(status.err) };
      return {
        signature,
        status:
          status.confirmationStatus === 'finalized'
            ? 'finalized'
            : status.confirmationStatus === 'processed'
              ? 'pending'
              : 'confirmed',
      };
    },
  };
}

/** A readable reason from simulation logs ("Error Message: ..." from Anchor programs). */
function explain(logs: readonly string[], err: unknown): string {
  if (err === 'AccountNotFound') return 'the wallet has no SOL';
  for (const line of [...logs].reverse()) {
    const anchor = line.match(/Error Message: (.+?)\.?$/);
    if (anchor) return anchor[1]!;
    if (/insufficient lamports|insufficient funds/i.test(line)) return 'not enough SOL';
  }
  return short(JSON.stringify(err));
}

function short(text: string): string {
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

function sol(lamports: number): string {
  return (lamports / LAMPORTS_PER_SOL).toFixed(4);
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}
