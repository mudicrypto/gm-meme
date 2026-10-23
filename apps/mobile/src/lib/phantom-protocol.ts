import { base58Decode, base58Encode, decodeTransaction, solanaKeys } from '@sift/shared';
import nacl from 'tweetnacl';

// Phantom's deeplink protocol (docs.phantom.com/phantom-deeplinks): the app opens
// https://phantom.com/ul/v1/<method>, Phantom redirects back with the result in the query
// string. After `connect`, every payload is encrypted with a shared secret from an x25519
// key exchange (TweetNaCl box), so session tokens can't be hijacked from the URL.

const BASE = 'https://phantom.com/ul/v1';

export type PhantomCluster = 'devnet' | 'mainnet-beta';

/** A connection to the user's Phantom wallet. Holds no wallet keys; Phantom keeps those. */
export interface PhantomSession {
  /** The user's wallet address. */
  publicKey: string;
  /** Phantom's session token, sent back with every request. */
  session: string;
  phantomEncryptionPublicKey: string;
  /** This app's x25519 secret for the encrypted channel (base58). Not a wallet key. */
  dappSecretKey: string;
}

export class PhantomError extends Error {
  override name = 'PhantomError';
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** A fresh x25519 keypair for one Phantom connection. */
export function newDappKeypair(randomBytes: (n: number) => Uint8Array) {
  const keypair = nacl.box.keyPair.fromSecretKey(randomBytes(32));
  return { publicKey: base58Encode(keypair.publicKey), secretKey: base58Encode(keypair.secretKey) };
}

export function connectUrl(opts: {
  dappPublicKey: string;
  cluster: PhantomCluster;
  appUrl: string;
  redirectLink: string;
}): string {
  return `${BASE}/connect?${new URLSearchParams({
    app_url: opts.appUrl,
    dapp_encryption_public_key: opts.dappPublicKey,
    redirect_link: opts.redirectLink,
    cluster: opts.cluster,
  })}`;
}

/** Phantom's answer to `connect`: decrypts the wallet address and session token. */
export function parseConnect(
  params: Record<string, string | undefined>,
  dappSecretKey: string,
): PhantomSession {
  throwIfError(params);
  const phantomKey = required(params, 'phantom_encryption_public_key');
  const data = decrypt(params, sharedSecret(phantomKey, dappSecretKey)) as {
    public_key?: unknown;
    session?: unknown;
  };
  if (typeof data.public_key !== 'string' || typeof data.session !== 'string') {
    throw new PhantomError('BAD_RESPONSE', 'Phantom sent an unexpected response.');
  }
  return {
    publicKey: data.public_key,
    session: data.session,
    phantomEncryptionPublicKey: phantomKey,
    dappSecretKey,
  };
}

export function signTransactionUrl(opts: {
  session: PhantomSession;
  transaction: Uint8Array;
  redirectLink: string;
  nonce: Uint8Array;
}): string {
  const payload = encrypt(
    { transaction: base58Encode(opts.transaction), session: opts.session.session },
    opts.session,
    opts.nonce,
  );
  return `${BASE}/signTransaction?${new URLSearchParams({
    dapp_encryption_public_key: dappPublicKey(opts.session),
    nonce: base58Encode(opts.nonce),
    redirect_link: opts.redirectLink,
    payload,
  })}`;
}

/**
 * Phantom's answer to `signTransaction`. Only accepts the exact transaction we sent, now
 * signed: if Phantom (or anything in between) changed it, the user never approved that.
 */
export function parseSignTransaction(
  params: Record<string, string | undefined>,
  session: PhantomSession,
  sent: Uint8Array,
): Uint8Array {
  throwIfError(params);
  const data = decrypt(
    params,
    sharedSecret(session.phantomEncryptionPublicKey, session.dappSecretKey),
  ) as {
    transaction?: unknown;
  };
  if (typeof data.transaction !== 'string')
    throw new PhantomError('BAD_RESPONSE', 'Phantom sent an unexpected response.');
  const signed = base58Decode(data.transaction);
  const message = decodeTransaction(sent).message;
  if (!sameBytes(messageOf(signed), message)) {
    throw new PhantomError(
      'MODIFIED',
      'Phantom returned a different transaction than the one you reviewed, so Sift did not send it.',
    );
  }
  const signature = decodeTransaction(signed).signatures[0];
  if (!signature || !solanaKeys.verify(signature, message, session.publicKey)) {
    throw new PhantomError(
      'BAD_SIGNATURE',
      'Phantom’s signature didn’t check out, so Sift did not send it.',
    );
  }
  return signed;
}

/** Ask Phantom to sign a plain-text message (sign-in). Can't move funds. */
export function signMessageUrl(opts: {
  session: PhantomSession;
  message: Uint8Array;
  redirectLink: string;
  nonce: Uint8Array;
}): string {
  const payload = encrypt(
    { message: base58Encode(opts.message), session: opts.session.session, display: 'utf8' },
    opts.session,
    opts.nonce,
  );
  return `${BASE}/signMessage?${new URLSearchParams({
    dapp_encryption_public_key: dappPublicKey(opts.session),
    nonce: base58Encode(opts.nonce),
    redirect_link: opts.redirectLink,
    payload,
  })}`;
}

/** Phantom's answer to `signMessage`: a signature we check against the connected wallet. */
export function parseSignMessage(
  params: Record<string, string | undefined>,
  session: PhantomSession,
  message: Uint8Array,
): Uint8Array {
  throwIfError(params);
  const data = decrypt(
    params,
    sharedSecret(session.phantomEncryptionPublicKey, session.dappSecretKey),
  ) as { signature?: unknown };
  if (typeof data.signature !== 'string')
    throw new PhantomError('BAD_RESPONSE', 'Phantom sent an unexpected response.');
  const signature = base58Decode(data.signature);
  if (signature.length !== 64 || !solanaKeys.verify(signature, message, session.publicKey)) {
    throw new PhantomError('BAD_SIGNATURE', 'Phantom’s signature didn’t check out.');
  }
  return signature;
}

const ERROR_MESSAGES: Record<string, string> = {
  '4001': 'You declined the request in Phantom.',
  '4100': 'Phantom no longer recognises this connection. Connect again.',
  '-32002': 'Phantom already has a request open. Finish it first.',
};

function throwIfError(params: Record<string, string | undefined>) {
  const code = params.errorCode;
  // Only our own wording: anyone can open a Sift link with a made-up errorMessage
  // ("re-enter your recovery phrase at …"), and it must never reach the screen.
  if (code) {
    throw new PhantomError(
      code.slice(0, 12),
      ERROR_MESSAGES[code] ?? 'Phantom couldn’t complete the request. Please try again.',
    );
  }
}

function required(params: Record<string, string | undefined>, name: string): string {
  const value = params[name];
  if (!value) throw new PhantomError('BAD_RESPONSE', 'Phantom sent an incomplete response.');
  return value;
}

function sharedSecret(phantomPublicKey: string, dappSecretKey: string): Uint8Array {
  return nacl.box.before(base58Decode(phantomPublicKey), base58Decode(dappSecretKey));
}

function dappPublicKey(session: PhantomSession): string {
  return base58Encode(
    nacl.box.keyPair.fromSecretKey(base58Decode(session.dappSecretKey)).publicKey,
  );
}

function encrypt(payload: unknown, session: PhantomSession, nonce: Uint8Array): string {
  const shared = sharedSecret(session.phantomEncryptionPublicKey, session.dappSecretKey);
  return base58Encode(nacl.box.after(utf8(JSON.stringify(payload)), nonce, shared));
}

function decrypt(params: Record<string, string | undefined>, shared: Uint8Array): unknown {
  const opened = nacl.box.open.after(
    base58Decode(required(params, 'data')),
    base58Decode(required(params, 'nonce')),
    shared,
  );
  if (!opened) throw new PhantomError('BAD_RESPONSE', 'Could not read Phantom’s response.');
  return JSON.parse(fromUtf8(opened));
}

// Phantom payloads are ASCII JSON (base58 strings and keys); no TextEncoder needed.
function utf8(text: string): Uint8Array {
  return Uint8Array.from(text, (char) => char.charCodeAt(0));
}
function fromUtf8(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes);
}

function messageOf(transaction: Uint8Array): Uint8Array | null {
  try {
    return decodeTransaction(transaction).message;
  } catch {
    return null;
  }
}

function sameBytes(a: Uint8Array | null, b: Uint8Array): boolean {
  return a !== null && a.length === b.length && a.every((byte, i) => byte === b[i]);
}
