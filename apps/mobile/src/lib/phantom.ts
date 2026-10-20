import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import {
  type PhantomCluster,
  type PhantomSession,
  PhantomError,
  connectUrl,
  newDappKeypair,
  parseConnect,
  parseSignMessage,
  parseSignTransaction,
  signMessageUrl,
  signTransactionUrl,
} from './phantom-protocol';
import { type RedirectParams, createRequestRegistry } from './phantom-requests';

// Shown by Phantom on its approval screen (it reads the site's name and icon).
const APP_URL = process.env.EXPO_PUBLIC_APP_URL || 'https://github.com/mudicrypto/gm-meme';

const registry = createRequestRegistry();

/** Called by the phantom-callback screen when Phantom sends the user back. */
export const deliverPhantomRedirect = (action: string, params: RedirectParams) =>
  registry.deliver(action, params);
export const cancelPhantomRequest = () => registry.cancel();

// sift://phantom-callback/<action> in a build; exp://<host>/--/phantom-callback/<action> in Expo Go.
const redirectLink = (action: string) => Linking.createURL(`phantom-callback/${action}`);

async function ask(action: string, url: string): Promise<RedirectParams> {
  const answer = registry.start(action);
  try {
    await Linking.openURL(url);
  } catch {
    registry.cancel('Couldn’t open Phantom. Is it installed?');
  }
  return answer;
}

export async function phantomConnect(cluster: PhantomCluster): Promise<PhantomSession> {
  const dapp = newDappKeypair(Crypto.getRandomBytes);
  const url = connectUrl({
    dappPublicKey: dapp.publicKey,
    cluster,
    appUrl: APP_URL,
    redirectLink: redirectLink('connect'),
  });
  return parseConnect(await ask('connect', url), dapp.secretKey);
}

/** Phantom signs; we only accept the exact transaction we sent, signed by the connected wallet. */
export async function phantomSign(
  session: PhantomSession,
  transaction: Uint8Array,
): Promise<Uint8Array> {
  const url = signTransactionUrl({
    session,
    transaction,
    redirectLink: redirectLink('signTransaction'),
    nonce: Crypto.getRandomBytes(24),
  });
  return parseSignTransaction(await ask('signTransaction', url), session, transaction);
}

/** Phantom signs a plain-text message (sign-in); we check the signature is the wallet's. */
export async function phantomSignMessage(
  session: PhantomSession,
  message: Uint8Array,
): Promise<Uint8Array> {
  const url = signMessageUrl({
    session,
    message,
    redirectLink: redirectLink('signMessage'),
    nonce: Crypto.getRandomBytes(24),
  });
  return parseSignMessage(await ask('signMessage', url), session, message);
}

/** The user (or a newer request) called it off; nothing to report. */
export const isCancelled = (error: unknown) =>
  error instanceof PhantomError && error.code === 'CANCELLED';

export { PhantomError, type PhantomSession };
