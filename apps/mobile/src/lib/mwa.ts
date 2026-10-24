import { bytesToBase64, publicKeyBytes } from '@sift/shared';
import { Platform } from 'react-native';
import {
  authorizedAddress,
  checkedMessageSignature,
  checkedSignedTransaction,
  safeWalletUriBase,
} from './mwa-results';

// Mobile Wallet Adapter: Android's standard way to use a wallet app (Phantom, Solflare,
// Backpack…). Android shows the wallets installed; the session is encrypted between the
// two apps on the phone, with no links through Sift's URL scheme to fake. Keys stay in the
// wallet; every answer is checked here before use.

export type MwaCluster = 'devnet' | 'mainnet-beta';

/** A wallet app this phone is connected to. The auth token lets Sift skip re-approving. */
export interface MwaSession {
  address: string;
  authToken: string;
  walletUriBase?: string;
  cluster: MwaCluster;
}

const IDENTITY = {
  name: 'Sift',
  uri: process.env.EXPO_PUBLIC_APP_URL || 'https://github.com/mudicrypto/gm-meme',
};

export const mwaAvailable = Platform.OS === 'android';

// Loaded on first use only: the native module exists on Android alone.
const protocol = () => import('@solana-mobile/mobile-wallet-adapter-protocol');

type Wallet = Parameters<Parameters<Awaited<ReturnType<typeof protocol>>['transact']>[0]>[0];

async function inWallet<T>(
  session: Pick<MwaSession, 'authToken' | 'walletUriBase' | 'cluster'> | null,
  cluster: MwaCluster,
  run: (
    wallet: Wallet,
    auth: { address: string; authToken: string; walletUriBase?: string },
  ) => Promise<T>,
): Promise<T> {
  const { transact } = await protocol();
  return transact(
    async (wallet) => {
      const auth = await wallet.authorize({
        chain: `solana:${cluster}`,
        identity: IDENTITY,
        ...(session ? { auth_token: session.authToken } : {}),
      });
      return run(wallet, {
        address: authorizedAddress(auth.accounts),
        authToken: auth.auth_token,
        walletUriBase: safeWalletUriBase(auth.wallet_uri_base),
      });
    },
    session?.walletUriBase ? { baseUri: session.walletUriBase } : undefined,
  );
}

export async function mwaConnect(cluster: MwaCluster): Promise<MwaSession> {
  return inWallet(null, cluster, async (_wallet, auth) => ({ ...auth, cluster }));
}

/** Sign in the wallet app; only the exact transaction, signed by this wallet, comes back. */
export async function mwaSignTransaction(
  session: MwaSession,
  transaction: Uint8Array,
): Promise<{ signed: Uint8Array; session: MwaSession }> {
  return inWallet(session, session.cluster, async (wallet, auth) => {
    if (auth.address !== session.address) throw new Error('The wallet switched accounts.');
    const { signed_payloads } = await wallet.signTransactions({
      payloads: [bytesToBase64(transaction)],
    });
    return {
      signed: checkedSignedTransaction(signed_payloads[0], transaction, session.address),
      session: { ...session, authToken: auth.authToken },
    };
  });
}

export async function mwaSignMessage(
  session: MwaSession,
  message: Uint8Array,
): Promise<{ signature: Uint8Array; session: MwaSession }> {
  return inWallet(session, session.cluster, async (wallet, auth) => {
    if (auth.address !== session.address) throw new Error('The wallet switched accounts.');
    const { signed_payloads } = await wallet.signMessages({
      addresses: [bytesToBase64(publicKeyBytes(session.address))],
      payloads: [bytesToBase64(message)],
    });
    return {
      signature: checkedMessageSignature(signed_payloads[0], message, session.address),
      session: { ...session, authToken: auth.authToken },
    };
  });
}
