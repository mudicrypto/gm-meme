import { decodeTransaction, solanaKeys } from '@sift/shared';

/**
 * What a wallet app sent back for a transaction we asked it to sign. Only the exact
 * transaction the user reviewed, validly signed by the connected wallet, may be sent:
 * anything else is refused, whichever app (or fake app) answered.
 */
export function signedTransactionProblem(
  signed: Uint8Array,
  sent: Uint8Array,
  signer: string,
): 'MODIFIED' | 'BAD_SIGNATURE' | null {
  const message = decodeTransaction(sent).message;
  const returned = messageOf(signed);
  if (!returned || !sameBytes(returned, message)) return 'MODIFIED';
  const signature = decodeTransaction(signed).signatures[0];
  return signature && solanaKeys.verify(signature, message, signer) ? null : 'BAD_SIGNATURE';
}

/** A message signature from a wallet app, checked against the connected address. */
export function messageSignatureValid(
  signature: Uint8Array,
  message: Uint8Array,
  signer: string,
): boolean {
  return signature.length === 64 && solanaKeys.verify(signature, message, signer);
}

function messageOf(transaction: Uint8Array): Uint8Array | null {
  try {
    return decodeTransaction(transaction).message;
  } catch {
    return null;
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}
