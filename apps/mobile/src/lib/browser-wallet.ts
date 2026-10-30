import { decodeTransaction, solanaKeys } from '@sift/shared';

/**
 * Browser wallet extensions (Phantom, Solflare, Backpack…) on the web build, found through
 * the Wallet Standard. The discovery handshake is two window events, so it's written here
 * rather than pulled in as a dependency. Keys stay in the extension; Sift only asks it to
 * sign, and checks that what comes back is exactly what it asked for.
 */

export type BrowserCluster = 'devnet' | 'mainnet-beta';

interface StandardAccount {
  readonly address: string;
  readonly publicKey: Uint8Array;
  readonly chains: readonly string[];
}

interface StandardWallet {
  readonly name: string;
  readonly icon: string;
  readonly chains: readonly string[];
  readonly accounts: readonly StandardAccount[];
  readonly features: Readonly<Record<string, unknown>>;
}

type ConnectFeature = {
  connect(input?: { silent?: boolean }): Promise<{ accounts: readonly StandardAccount[] }>;
};
type DisconnectFeature = { disconnect(): Promise<void> };
type SignTransactionFeature = {
  signTransaction(
    ...inputs: { account: StandardAccount; transaction: Uint8Array; chain?: string }[]
  ): Promise<readonly { signedTransaction: Uint8Array }[]>;
};
type SignMessageFeature = {
  signMessage(
    ...inputs: { account: StandardAccount; message: Uint8Array }[]
  ): Promise<readonly { signature: Uint8Array }[]>;
};

/** What the app needs to know about an installed wallet. */
export interface BrowserWalletInfo {
  name: string;
  /** A data: URL from the extension itself. */
  icon: string;
}

export interface BrowserSession {
  walletName: string;
  address: string;
  cluster: BrowserCluster;
}

const chainOf = (cluster: BrowserCluster) =>
  cluster === 'devnet' ? 'solana:devnet' : 'solana:mainnet';

const wallets = new Set<StandardWallet>();
const listeners = new Set<() => void>();
let started = false;

function usable(wallet: StandardWallet): boolean {
  const f = wallet.features;
  return (
    typeof wallet.name === 'string' &&
    'standard:connect' in f &&
    'solana:signTransaction' in f &&
    'solana:signMessage' in f &&
    wallet.chains.some((chain) => chain.startsWith('solana:'))
  );
}

/** Start listening for wallets (web only; a no-op elsewhere). Safe to call repeatedly. */
export function startDiscovery(): void {
  if (started || typeof window === 'undefined' || typeof window.addEventListener !== 'function')
    return;
  started = true;
  const api = Object.freeze({
    register(...registered: StandardWallet[]) {
      for (const wallet of registered) if (usable(wallet)) wallets.add(wallet);
      for (const listener of listeners) listener();
      return () => {
        for (const wallet of registered) wallets.delete(wallet);
        for (const listener of listeners) listener();
      };
    },
  });
  // Wallets that load after the app announce themselves with this event…
  window.addEventListener('wallet-standard:register-wallet', ((event: CustomEvent) => {
    try {
      (event.detail as (api: unknown) => void)(api);
    } catch {
      // A broken extension mustn't break the app.
    }
  }) as EventListener);
  // …and wallets already loaded answer this one.
  try {
    window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: api }));
  } catch {
    // Older browsers: wallets still find us through the event above.
  }
}

export const browserWalletsAvailable = typeof window !== 'undefined' && 'dispatchEvent' in window;

export function installedWallets(): BrowserWalletInfo[] {
  return [...wallets].map((w) => ({ name: w.name, icon: w.icon }));
}

/** Calls `listener` whenever a wallet appears or goes; returns an unsubscribe. */
export function onWalletsChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function walletNamed(name: string): StandardWallet {
  const wallet = [...wallets].find((w) => w.name === name);
  if (!wallet) throw new Error(`${name} isn’t available in this browser. Is the extension on?`);
  return wallet;
}

function accountOf(wallet: StandardWallet, address: string): StandardAccount {
  const account = wallet.accounts.find((a) => a.address === address);
  if (!account) throw new Error(`Reconnect ${wallet.name}: it no longer shares this account.`);
  return account;
}

/** Asks the wallet to connect (it shows its own prompt) and returns the first account. */
export async function connectBrowserWallet(
  name: string,
  cluster: BrowserCluster,
  silent = false,
): Promise<BrowserSession> {
  const wallet = walletNamed(name);
  const { accounts } = await (wallet.features['standard:connect'] as ConnectFeature).connect(
    silent ? { silent: true } : undefined,
  );
  const account = accounts[0] ?? wallet.accounts[0];
  if (!account) throw new Error(`${name} didn’t share an account.`);
  return { walletName: name, address: account.address, cluster };
}

export async function disconnectBrowserWallet(session: BrowserSession): Promise<void> {
  const wallet = [...wallets].find((w) => w.name === session.walletName);
  const feature = wallet?.features['standard:disconnect'] as DisconnectFeature | undefined;
  await feature?.disconnect().catch(() => {});
}

/**
 * Signs one transaction. The wallet must return the same message with a signature added:
 * a wallet that changes the transaction (adds instructions, swaps accounts) is refused,
 * because Sift only sends what it checked and you reviewed.
 */
export async function browserSignTransaction(
  session: BrowserSession,
  transaction: Uint8Array,
): Promise<Uint8Array> {
  const wallet = walletNamed(session.walletName);
  const account = accountOf(wallet, session.address);
  const [result] = await (
    wallet.features['solana:signTransaction'] as SignTransactionFeature
  ).signTransaction({ account, transaction, chain: chainOf(session.cluster) });
  if (!result) throw new Error(`${wallet.name} didn’t sign.`);
  if (!sameMessage(transaction, result.signedTransaction))
    throw new Error(
      `${wallet.name} changed the transaction, so Sift didn’t send it. Sift only sends the transaction you reviewed.`,
    );
  if (!signedBy(result.signedTransaction, session.address))
    throw new Error(`${wallet.name} returned the transaction without a valid signature.`);
  return result.signedTransaction;
}

export async function browserSignMessage(
  session: BrowserSession,
  message: Uint8Array,
): Promise<Uint8Array> {
  const wallet = walletNamed(session.walletName);
  const account = accountOf(wallet, session.address);
  const [result] = await (wallet.features['solana:signMessage'] as SignMessageFeature).signMessage({
    account,
    message,
  });
  if (!result || result.signature.length !== 64) throw new Error(`${wallet.name} didn’t sign.`);
  return result.signature;
}

/** True when the first signature is a valid signature of the message by `address`. */
export function signedBy(signed: Uint8Array, address: string): boolean {
  try {
    const tx = decodeTransaction(signed);
    const signature = tx.signatures[0];
    return (
      !!signature &&
      tx.accountKeys[0] === address &&
      solanaKeys.verify(signature, tx.message, address)
    );
  } catch {
    return false;
  }
}

/** True when both transactions carry byte-identical messages (signatures aside). */
export function sameMessage(original: Uint8Array, signed: Uint8Array): boolean {
  try {
    const a = decodeTransaction(original).message;
    const b = decodeTransaction(signed).message;
    return a.length === b.length && a.every((byte, i) => byte === b[i]);
  } catch {
    return false;
  }
}

export function readBrowserSession(json: string): BrowserSession | null {
  try {
    const v = JSON.parse(json) as Partial<BrowserSession>;
    return typeof v.walletName === 'string' &&
      typeof v.address === 'string' &&
      (v.cluster === 'devnet' || v.cluster === 'mainnet-beta')
      ? (v as BrowserSession)
      : null;
  } catch {
    return null;
  }
}

/** Test hook: register wallets directly, as an extension would. */
export function registerForTest(...registered: StandardWallet[]): void {
  for (const wallet of registered) if (usable(wallet)) wallets.add(wallet);
  for (const listener of listeners) listener();
}
