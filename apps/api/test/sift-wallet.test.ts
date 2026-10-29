import { generateKeyPairSync, verify } from 'node:crypto';
import { base58Encode, solanaKeys } from '@sift/shared';
import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createWalletChain } from '../src/sift-wallet/chain';
import { InMemorySiftWalletRepository } from '../src/sift-wallet/memory-repository';
import { createSiftWalletService } from '../src/sift-wallet/service';
import {
  SignerError,
  type WalletSigner,
  canonicalJson,
  createPrivySigner,
  siftWalletPolicy,
} from '../src/sift-wallet/signer';
import { totpCode } from '../src/sift-wallet/totp';
import { withdrawalProblems } from '../src/sift-wallet/verify-withdrawal';
import { InMemorySocialRepository } from '../src/social/memory-repository';
import { InMemoryTokenRepository } from '../src/tokens/memory-repository';
import { type TradeService, createTradeService } from '../src/trading/service';
import {
  FEE_WALLET,
  MINT,
  asConnection,
  fakeConnection,
  fakePumpTrader,
} from './helpers/fake-trading';

let clock = new Date('2026-10-29T10:00:00Z');
const later = (ms: number) => {
  clock = new Date(clock.getTime() + ms);
};
const HOUR = 60 * 60 * 1000;
const SOL = 1_000_000_000;

/** A stand-in for Privy: keeps test keypairs in memory and signs anything asked. */
function fakeSigner() {
  const keys = new Map<string, Keypair>();
  const signer = {
    createWallet: vi.fn(async () => {
      const kp = Keypair.generate();
      const providerId = `pv${keys.size}`;
      keys.set(providerId, kp);
      return { providerId, address: kp.publicKey.toBase58() };
    }),
    setAllowedRecipients: vi.fn(async () => {}),
    signTransaction: vi.fn(async (providerId: string, transaction: string) => {
      const tx = VersionedTransaction.deserialize(Buffer.from(transaction, 'base64'));
      tx.sign([keys.get(providerId)!]);
      return Buffer.from(tx.serialize()).toString('base64');
    }),
    exportKey: vi.fn(async () => ({ ciphertext: 'c2VjcmV0', encapsulatedKey: 'ZW5j' })),
  } satisfies WalletSigner;
  return signer;
}

function setup(
  opts: { signer?: WalletSigner | null; frozen?: boolean; trades?: TradeService } = {},
) {
  const connection = Object.assign(fakeConnection(), {
    getParsedTokenAccountsByOwner: vi.fn(async () => ({
      context: { slot: 1 },
      value: [
        {
          pubkey: PublicKey.default,
          account: {
            data: { parsed: { info: { tokenAmount: { amount: '5000000000', decimals: 6 } } } },
          },
        },
      ],
    })),
  });
  const trades =
    opts.trades ??
    createTradeService({
      connection: asConnection(connection),
      pump: fakePumpTrader(),
      estimatePriorityFee: async () => 10_000,
      feeWallet: FEE_WALLET,
      platformFeeBps: 50,
      now: () => clock,
    });
  const tokens = new InMemoryTokenRepository();
  const prices = new Map<string, number>();
  vi.spyOn(tokens, 'getLatestPrices').mockImplementation(async (mints) => {
    return new Map(mints.flatMap((m) => (prices.has(m) ? [[m, prices.get(m)!] as const] : [])));
  });
  const signer = fakeSigner();
  const push = { send: vi.fn(async () => []) };
  const app = buildApp(
    loadConfig({
      LOG_LEVEL: 'silent',
      ALERT_CHECK_INTERVAL_MS: '0',
      ORDER_CHECK_INTERVAL_MS: '0',
      FEE_WALLET,
      SIFT_SIGNING_FROZEN: opts.frozen ? 'true' : 'false',
    }),
    {
      tokenRepository: tokens,
      socialRepository: new InMemorySocialRepository(),
      siftWalletRepository: new InMemorySiftWalletRepository(),
      push,
      helius: null,
      tradeService: trades,
      walletSigner: opts.signer === undefined ? signer : opts.signer,
      walletChain: createWalletChain(asConnection(connection)),
      now: () => clock,
    },
  );
  return { app, trades, tokens, prices, signer, connection, push };
}

type App = ReturnType<typeof setup>['app'];

async function signIn(app: App) {
  const seed = crypto.getRandomValues(new Uint8Array(32));
  const wallet = solanaKeys.publicKey(seed);
  const challenge = await app.inject({
    method: 'POST',
    url: '/auth/challenge',
    payload: { wallet },
  });
  const { message, nonce } = challenge.json<{ message: string; nonce: string }>();
  const signature = solanaKeys.sign(new TextEncoder().encode(message), seed);
  const session = await app.inject({
    method: 'POST',
    url: '/auth/session',
    payload: { wallet, nonce, signature: base58Encode(signature) },
  });
  return { authorization: `Bearer ${session.json<{ token: string }>().token}` };
}

async function withWallet(app: App) {
  const headers = await signIn(app);
  const created = await app.inject({ method: 'POST', url: '/me/sift-wallet', headers });
  expect(created.statusCode).toBe(200);
  const address = created.json<{ wallet: { address: string } }>().wallet.address;
  return { headers, address };
}

async function withTwoFactor(app: App) {
  const { headers, address } = await withWallet(app);
  const start = await app.inject({ method: 'POST', url: '/me/sift-wallet/2fa', headers });
  const { secret, uri } = start.json<{ secret: string; uri: string }>();
  expect(uri).toContain('otpauth://totp/');
  const confirm = await app.inject({
    method: 'POST',
    url: '/me/sift-wallet/2fa/confirm',
    headers,
    payload: { code: totpCode(secret, clock) },
  });
  expect(confirm.statusCode).toBe(200);
  return { headers, address, code: () => totpCode(secret, clock) };
}

describe('Sift wallet', () => {
  let ctx: ReturnType<typeof setup>;
  let app: App;
  beforeEach(() => {
    ctx = setup();
    app = ctx.app;
  });
  afterEach(() => app.close());

  it('needs sign-in', async () => {
    expect((await app.inject({ method: 'GET', url: '/me/sift-wallet' })).statusCode).toBe(401);
  });

  it('creates one wallet per account with the default caps', async () => {
    const headers = await signIn(app);
    const before = await app.inject({ method: 'GET', url: '/me/sift-wallet', headers });
    expect(before.json()).toEqual({ wallet: null, signing: 'live' });
    const first = await app.inject({ method: 'POST', url: '/me/sift-wallet', headers });
    const again = await app.inject({ method: 'POST', url: '/me/sift-wallet', headers });
    expect(again.json()).toEqual(first.json());
    expect(first.json().wallet).toMatchObject({
      frozen: false,
      signing: 'live',
      limits: { perOrderLamports: SOL, dailyLamports: 5 * SOL, usedTodayLamports: 0 },
      withdrawal: { address: null, readyAt: null },
      twoFactor: { enabled: false },
    });
    // The provider policy only lets SOL go to Sift's fee wallet to start with.
    expect(ctx.signer.createWallet).toHaveBeenLastCalledWith({ allowedRecipients: [FEE_WALLET] });
  });

  it('turns on 2FA only with a correct code, and locks out repeated guesses', async () => {
    const { headers } = await withWallet(app);
    const start = await app.inject({ method: 'POST', url: '/me/sift-wallet/2fa', headers });
    const { secret } = start.json<{ secret: string }>();
    for (let i = 0; i < 5; i++) {
      const wrong = await app.inject({
        method: 'POST',
        url: '/me/sift-wallet/2fa/confirm',
        headers,
        payload: { code: '000000' },
      });
      expect(wrong.statusCode).toBe(401);
    }
    const locked = await app.inject({
      method: 'POST',
      url: '/me/sift-wallet/2fa/confirm',
      headers,
      payload: { code: totpCode(secret, clock) },
    });
    expect(locked.statusCode).toBe(429);
    later(16 * 60_000);
    const ok = await app.inject({
      method: 'POST',
      url: '/me/sift-wallet/2fa/confirm',
      headers,
      payload: { code: totpCode(secret, clock) },
    });
    expect(ok.json().wallet.twoFactor).toEqual({ enabled: true });
  });

  it('holds withdrawals for 24 hours after a new address, then sends exactly that transfer', async () => {
    const { headers, address, code } = await withTwoFactor(app);
    const dest = Keypair.generate().publicKey.toBase58();
    const noCode = await app.inject({
      method: 'PUT',
      url: '/me/sift-wallet/withdrawal-address',
      headers,
      payload: { address: dest, code: '123456' },
    });
    expect(noCode.statusCode).toBe(401);
    const saved = await app.inject({
      method: 'PUT',
      url: '/me/sift-wallet/withdrawal-address',
      headers,
      payload: { address: dest, code: code() },
    });
    expect(saved.json().wallet.withdrawal.address).toBe(dest);
    expect(ctx.signer.setAllowedRecipients).toHaveBeenLastCalledWith(expect.any(String), [
      FEE_WALLET,
      dest,
    ]);

    const early = await app.inject({
      method: 'POST',
      url: '/me/sift-wallet/withdraw',
      headers,
      payload: { lamports: SOL, code: code() },
    });
    expect(early.statusCode).toBe(423);

    later(24 * HOUR + 1000);
    const tooMuch = await app.inject({
      method: 'POST',
      url: '/me/sift-wallet/withdraw',
      headers,
      payload: { lamports: 5 * SOL, code: code() },
    });
    expect(tooMuch.statusCode).toBe(422);
    const sent = await app.inject({
      method: 'POST',
      url: '/me/sift-wallet/withdraw',
      headers,
      payload: { lamports: SOL, code: code() },
    });
    expect(sent.statusCode).toBe(200);
    const signedTx = ctx.signer.signTransaction.mock.lastCall![1];
    expect(withdrawalProblems(signedTx, { from: address, to: dest, lamports: SOL })).toEqual([]);
    expect(ctx.connection.sendRawTransaction).toHaveBeenCalled();
  });

  it('signs a reviewed trade from the Sift wallet within the caps, and records the spend', async () => {
    const { headers, address } = await withWallet(app);
    const quote = await ctx.trades.quote({
      mint: MINT.toBase58(),
      wallet: address,
      side: 'buy',
      amount: String(SOL / 10),
      slippageBps: 500,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/me/sift-wallet/trades',
      headers,
      payload: { quoteId: quote.quoteId },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ signature: '5'.repeat(88) });
    const info = await app.inject({ method: 'GET', url: '/me/sift-wallet', headers });
    expect(info.json().wallet.limits.usedTodayLamports).toBe(quote.worstCaseLamports);

    const big = await ctx.trades.quote({
      mint: MINT.toBase58(),
      wallet: address,
      side: 'buy',
      amount: String(2 * SOL),
      slippageBps: 500,
    });
    const over = await app.inject({
      method: 'POST',
      url: '/me/sift-wallet/trades',
      headers,
      payload: { quoteId: big.quoteId },
    });
    expect(over.statusCode).toBe(422);
    expect(over.json().error).toBe('OVER_LIMIT');
  });

  it('refuses a quote for another wallet', async () => {
    const { headers } = await withWallet(app);
    const quote = await ctx.trades.quote({
      mint: MINT.toBase58(),
      wallet: Keypair.generate().publicKey.toBase58(),
      side: 'buy',
      amount: String(SOL / 10),
      slippageBps: 500,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/me/sift-wallet/trades',
      headers,
      payload: { quoteId: quote.quoteId },
    });
    expect(res.json().error).toBe('WRONG_WALLET');
  });

  it('signs nothing while frozen, and unfreezes with a code', async () => {
    const { headers, address, code } = await withTwoFactor(app);
    await app.inject({ method: 'POST', url: '/me/sift-wallet/freeze', headers });
    const quote = await ctx.trades.quote({
      mint: MINT.toBase58(),
      wallet: address,
      side: 'buy',
      amount: String(SOL / 10),
      slippageBps: 500,
    });
    const calls = ctx.signer.signTransaction.mock.calls.length;
    const res = await app.inject({
      method: 'POST',
      url: '/me/sift-wallet/trades',
      headers,
      payload: { quoteId: quote.quoteId },
    });
    expect(res.statusCode).toBe(423);
    expect(ctx.signer.signTransaction.mock.calls.length).toBe(calls);
    expect(ctx.push.send).toBeDefined();
    const noCode = await app.inject({
      method: 'POST',
      url: '/me/sift-wallet/unfreeze',
      headers,
      payload: {},
    });
    expect(noCode.statusCode).toBe(401);
    const ok = await app.inject({
      method: 'POST',
      url: '/me/sift-wallet/unfreeze',
      headers,
      payload: { code: code() },
    });
    expect(ok.json().wallet.frozen).toBe(false);
  });

  it('raises caps only with a code, lowers them freely', async () => {
    const { headers } = await withWallet(app);
    const raise = await app.inject({
      method: 'PUT',
      url: '/me/sift-wallet/limits',
      headers,
      payload: { perOrderLamports: 2 * SOL, dailyLamports: 5 * SOL },
    });
    expect(raise.statusCode).toBe(409);
    const lower = await app.inject({
      method: 'PUT',
      url: '/me/sift-wallet/limits',
      headers,
      payload: { perOrderLamports: SOL / 2, dailyLamports: 2 * SOL },
    });
    expect(lower.json().wallet.limits).toMatchObject({
      perOrderLamports: SOL / 2,
      dailyLamports: 2 * SOL,
    });
  });

  it('exports the key only as ciphertext, behind 2FA', async () => {
    const { headers, code } = await withTwoFactor(app);
    const recipientPublicKey = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString(
      'base64',
    );
    const wrong = await app.inject({
      method: 'POST',
      url: '/me/sift-wallet/export',
      headers,
      payload: { code: '111111', recipientPublicKey },
    });
    expect(wrong.statusCode).toBe(401);
    const res = await app.inject({
      method: 'POST',
      url: '/me/sift-wallet/export',
      headers,
      payload: { code: code(), recipientPublicKey },
    });
    expect(res.json()).toEqual({ ciphertext: 'c2VjcmV0', encapsulatedKey: 'ZW5j' });
    expect(ctx.signer.exportKey).toHaveBeenLastCalledWith(expect.any(String), recipientPublicKey);
  });
});

describe('order engine', () => {
  async function engine() {
    const { trades, tokens, prices, signer, connection } = setup();
    const repo = new InMemorySiftWalletRepository();
    const notify = vi.fn(async () => {});
    const wallets = createSiftWalletService({
      repo,
      signer,
      trades,
      chain: createWalletChain(asConnection(connection)),
      tokens,
      feeWallet: FEE_WALLET,
      platformFeeBps: 50,
      signingFrozen: false,
      notify,
      now: () => clock,
    });
    const owner = Keypair.generate().publicKey.toBase58();
    await wallets.create(owner);
    return { wallets, repo, prices, signer, tokens, notify, owner };
  }
  const mint = MINT.toBase58();
  const sell = (kind: 'stop_loss' | 'take_profit', trigger: number, extra = {}) => ({
    mint,
    kind,
    triggerPriceSol: trigger,
    sellPercent: 50,
    slippageBps: 1000,
    expiresInDays: 1,
    ...extra,
  });

  it('waits when the price gaps below a stop’s limit, and sells once it is back in range', async () => {
    const { wallets, prices, signer, owner } = await engine();
    prices.set(mint, 1);
    await wallets.placeOrders(owner, [sell('stop_loss', 0.7)]);
    expect(await wallets.runOrders()).toEqual({ executed: 0 });

    prices.set(mint, 0.5); // below the 0.63 floor
    expect(await wallets.runOrders()).toEqual({ executed: 0 });
    expect(signer.signTransaction).not.toHaveBeenCalled();
    let [order] = await wallets.orders(owner);
    expect(order?.status).toBe('open');
    expect(order?.message).toContain('gapped below your limit');

    prices.set(mint, 0.68);
    expect(await wallets.runOrders()).toEqual({ executed: 1 });
    [order] = await wallets.orders(owner);
    expect(order).toMatchObject({ status: 'filled', signature: '5'.repeat(88) });
    expect(signer.signTransaction).toHaveBeenCalledTimes(1);
  });

  it('fires a take profit and tells the owner', async () => {
    const { wallets, prices, notify, owner } = await engine();
    prices.set(mint, 1);
    await wallets.placeOrders(owner, [sell('take_profit', 2)]);
    prices.set(mint, 2.1);
    expect(await wallets.runOrders()).toEqual({ executed: 1 });
    expect(notify).toHaveBeenCalledWith(owner, expect.stringContaining('Sold'), expect.any(String));
  });

  it('follows the peak with a trailing stop', async () => {
    const { wallets, prices, owner } = await engine();
    prices.set(mint, 1);
    const [placed] = await wallets.placeOrders(owner, [sell('stop_loss', 0.8, { trailing: true })]);
    expect(placed?.trailingPct).toBeCloseTo(20);
    prices.set(mint, 2);
    await wallets.runOrders();
    prices.set(mint, 1.7);
    expect(await wallets.runOrders()).toEqual({ executed: 0 });
    prices.set(mint, 1.55); // the stop has moved up to 1.6
    expect(await wallets.runOrders()).toEqual({ executed: 1 });
  });

  it('never places or runs automatic buys of red tokens', async () => {
    const { wallets, tokens, owner } = await engine();
    await tokens.upsertTokens([{ mint }]);
    await tokens.setRiskLevel(mint, 'red', clock.toISOString());
    await expect(
      wallets.placeOrders(owner, [
        {
          mint,
          kind: 'limit_buy',
          triggerPriceSol: 0.5,
          buyLamports: SOL / 10,
          slippageBps: 1000,
          expiresInDays: 1,
        },
      ]),
    ).rejects.toMatchObject({ code: 'RED_TOKEN' });
  });

  it('expires orders and pauses everything while signing is frozen', async () => {
    const { wallets, prices, owner, notify } = await engine();
    prices.set(mint, 1);
    await wallets.placeOrders(owner, [sell('take_profit', 2)]);
    later(25 * HOUR);
    await wallets.runOrders();
    const [order] = await wallets.orders(owner);
    expect(order?.status).toBe('expired');
    expect(notify).toHaveBeenCalledWith(owner, 'Order expired', expect.any(String));
  });

  it('retries a failed run, then gives up and says why', async () => {
    const { wallets, prices, signer, owner } = await engine();
    prices.set(mint, 1);
    await wallets.placeOrders(owner, [sell('take_profit', 2)]);
    signer.signTransaction.mockRejectedValue(new SignerError('down', 503));
    prices.set(mint, 2.5);
    for (let i = 0; i < 3; i++) await wallets.runOrders();
    const [order] = await wallets.orders(owner);
    expect(order).toMatchObject({
      status: 'failed',
      message: 'The signing service refused or was unreachable.',
    });
  });
});

describe('withdrawalProblems', () => {
  const from = Keypair.generate().publicKey;
  const to = Keypair.generate().publicKey;
  const build = (instructions: Parameters<typeof SystemProgram.transfer>[0][], payer = from) =>
    Buffer.from(
      new VersionedTransaction(
        new TransactionMessage({
          payerKey: payer,
          recentBlockhash: 'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi',
          instructions: instructions.map((i) => SystemProgram.transfer(i)),
        }).compileToV0Message(),
      ).serialize(),
    ).toString('base64');
  const expected = { from: from.toBase58(), to: to.toBase58(), lamports: SOL };

  it('accepts exactly the expected transfer', () => {
    expect(
      withdrawalProblems(build([{ fromPubkey: from, toPubkey: to, lamports: SOL }]), expected),
    ).toEqual([]);
  });

  it('refuses another recipient, amount, a second transfer or another payer', () => {
    const other = Keypair.generate().publicKey;
    expect(
      withdrawalProblems(build([{ fromPubkey: from, toPubkey: other, lamports: SOL }]), expected),
    ).toContain('transfer not to the saved address');
    expect(
      withdrawalProblems(build([{ fromPubkey: from, toPubkey: to, lamports: SOL + 1 }]), expected),
    ).toContain('wrong amount');
    expect(
      withdrawalProblems(
        build([
          { fromPubkey: from, toPubkey: to, lamports: SOL },
          { fromPubkey: from, toPubkey: other, lamports: 1 },
        ]),
        expected,
      ),
    ).toContain('must be exactly one transfer');
    expect(withdrawalProblems('nope', expected)).toEqual(['unreadable transaction']);
  });
});

describe('Privy signer', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pkcs8 = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');

  it('signs each request with the owner key over the canonical payload', async () => {
    const fetchFn = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({
        method: 'signTransaction',
        data: { signed_transaction: 'U0lHTkVE', encoding: 'base64' },
      }),
    );
    const signer = createPrivySigner({
      appId: 'app1',
      appSecret: 'secret1',
      authorizationKey: `wallet-auth:${pkcs8}`,
      ownerId: 'owner1',
      maxTransferLamports: SOL,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(await signer.signTransaction('w1', 'VFg=')).toBe('U0lHTkVE');
    const [url, init] = fetchFn.mock.lastCall!;
    expect(url).toBe('https://api.privy.io/v1/wallets/w1/rpc');
    const headers = init.headers as Record<string, string>;
    expect(headers['privy-app-id']).toBe('app1');
    expect(headers.authorization).toBe(`Basic ${Buffer.from('app1:secret1').toString('base64')}`);
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      method: 'signTransaction',
      params: { transaction: 'VFg=', encoding: 'base64' },
    });
    const payload = canonicalJson({
      version: 1,
      method: 'POST',
      url,
      body,
      headers: { 'privy-app-id': 'app1' },
    });
    expect(
      verify(
        'sha256',
        Buffer.from(payload),
        publicKey,
        Buffer.from(headers['privy-authorization-signature']!, 'base64'),
      ),
    ).toBe(true);
  });

  it('creates a wallet with its own policy, owned by Sift’s key', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(init.body as string) });
      return url.endsWith('/policies')
        ? Response.json({ id: 'pol1' })
        : Response.json({ id: 'w1', address: 'So11111111111111111111111111111111111111112' });
    });
    const signer = createPrivySigner({
      appId: 'app1',
      appSecret: 's',
      authorizationKey: pkcs8,
      ownerId: 'owner1',
      maxTransferLamports: SOL,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(await signer.createWallet({ allowedRecipients: [FEE_WALLET] })).toEqual({
      providerId: 'w1',
      address: 'So11111111111111111111111111111111111111112',
    });
    expect(calls[0]!.body).toMatchObject({ owner_id: 'owner1', chain_type: 'solana' });
    expect(calls[1]!.body).toEqual({
      chain_type: 'solana',
      owner_id: 'owner1',
      policy_ids: ['pol1'],
    });
  });

  it('never passes the provider’s error text on', async () => {
    const signer = createPrivySigner({
      appId: 'a',
      appSecret: 's',
      authorizationKey: pkcs8,
      ownerId: 'o',
      maxTransferLamports: SOL,
      fetchFn: (async () =>
        new Response('secret detail', { status: 403 })) as unknown as typeof fetch,
    });
    const err = await signer.signTransaction('w', 'VFg=').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SignerError);
    expect((err as Error).message).not.toContain('secret detail');
  });

  it('allows only the swap programs and capped transfers to listed recipients', () => {
    const policy = siftWalletPolicy({ recipients: [FEE_WALLET], maxTransferLamports: SOL });
    expect(policy.rules).toHaveLength(2);
    expect(policy.rules[0]!.conditions[0]!.value).not.toContain('11111111111111111111111111111111');
    expect(policy.rules[1]!.conditions).toEqual([
      expect.objectContaining({ field: 'Transfer.to', value: [FEE_WALLET] }),
      expect.objectContaining({ field: 'Transfer.lamports', operator: 'lte', value: String(SOL) }),
    ]);
  });
});

describe('without a signing provider', () => {
  it('reports the wallet as not set up and refuses to create one', async () => {
    const { app } = setup({ signer: null });
    const headers = await signIn(app);
    const get = await app.inject({ method: 'GET', url: '/me/sift-wallet', headers });
    expect(get.json()).toEqual({ wallet: null, signing: 'not_configured' });
    const res = await app.inject({ method: 'POST', url: '/me/sift-wallet', headers });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('pauses all signing with the emergency switch', async () => {
    const { app, trades } = setup({ frozen: true });
    const { headers, address } = await withWallet(app);
    const quote = await trades.quote({
      mint: MINT.toBase58(),
      wallet: address,
      side: 'buy',
      amount: String(SOL / 10),
      slippageBps: 500,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/me/sift-wallet/trades',
      headers,
      payload: { quoteId: quote.quoteId },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe('PAUSED');
    await app.close();
  });
});
