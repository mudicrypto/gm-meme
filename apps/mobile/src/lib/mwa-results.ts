import { base58Encode, base64ToBytes, isSolanaAddress } from '@sift/shared';
import { messageSignatureValid, signedTransactionProblem } from './signed-check';

// Turning Mobile Wallet Adapter answers into checked values. Pure, so it is unit tested;
// the native session lives in mwa.ts.

/** The first account a wallet authorized, as a base58 address. */
export function authorizedAddress(accounts: readonly unknown[]): string {
  const account = accounts[0] as { address?: unknown; publicKey?: unknown } | undefined;
  // Wallet-standard accounts carry the key bytes; MWA's own carry base64.
  const bytes =
    account?.publicKey instanceof Uint8Array
      ? account.publicKey
      : typeof account?.address === 'string'
        ? safeBase64(account.address)
        : null;
  const address = bytes && bytes.length === 32 ? base58Encode(bytes) : null;
  if (!address || !isSolanaAddress(address)) throw new Error('The wallet didn’t share an account.');
  return address;
}

/** The signed transaction a wallet returned, only if it's exactly what we sent, signed. */
export function checkedSignedTransaction(
  signedBase64: string | undefined,
  sent: Uint8Array,
  signer: string,
): Uint8Array {
  const signed = signedBase64 ? safeBase64(signedBase64) : null;
  const problem = signed ? signedTransactionProblem(signed, sent, signer) : 'MODIFIED';
  if (problem === 'MODIFIED' || !signed) {
    throw new Error(
      'The wallet returned a different transaction than the one you reviewed, so Sift did not send it.',
    );
  }
  if (problem === 'BAD_SIGNATURE') {
    throw new Error('The wallet’s signature didn’t check out, so Sift did not send it.');
  }
  return signed;
}

/**
 * The signature in a wallet's signed message. MWA wallets return the message with the
 * 64-byte signature appended; only a valid signature by the connected wallet is accepted.
 */
export function checkedMessageSignature(
  signedBase64: string | undefined,
  message: Uint8Array,
  signer: string,
): Uint8Array {
  const signed = signedBase64 ? safeBase64(signedBase64) : null;
  const signature = signed && signed.length >= 64 ? signed.slice(signed.length - 64) : null;
  if (!signature || !messageSignatureValid(signature, message, signer)) {
    throw new Error('The wallet’s signature didn’t check out.');
  }
  return signature;
}

/** Only an https wallet link is reused to reach the same wallet next time. */
export function safeWalletUriBase(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    return new URL(value).protocol === 'https:' ? value : undefined;
  } catch {
    return undefined;
  }
}

function safeBase64(value: string): Uint8Array | null {
  try {
    return base64ToBytes(value);
  } catch {
    return null;
  }
}

/** Plain words for what went wrong in the wallet app; null when the user just backed out. */
export function mwaErrorMessage(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === 'ERROR_ASSOCIATION_CANCELLED' || code === 'ERROR_SESSION_CLOSED') return null;
  if (code === -1 || code === -3) return 'You declined the request in your wallet app.';
  if (code === 'ERROR_WALLET_NOT_FOUND') {
    return 'No Solana wallet app found on this phone. Install Phantom or Solflare first.';
  }
  if (code === 'ERROR_SESSION_TIMEOUT') return 'The wallet app didn’t answer in time. Try again.';
  return error instanceof Error ? error.message : 'The wallet app couldn’t complete the request.';
}
