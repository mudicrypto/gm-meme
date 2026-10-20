import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { base58Encode, publicKeyBytes } from './base58';

export const SYSTEM_PROGRAM = '11111111111111111111111111111111';
export const COMPUTE_BUDGET_PROGRAM = 'ComputeBudget111111111111111111111111111111';
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const ASSOCIATED_TOKEN_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';

const PDA_MARKER = Uint8Array.from('ProgramDerivedAddress', (char) => char.charCodeAt(0));

function isOnCurve(bytes: Uint8Array): boolean {
  try {
    ed25519.Point.fromBytes(bytes);
    return true;
  } catch {
    return false;
  }
}

/** Solana's findProgramAddress: the first off-curve sha256(seeds | bump | program | marker). */
export function findProgramAddress(seeds: readonly Uint8Array[], programId: string): string {
  const program = publicKeyBytes(programId);
  for (let bump = 255; bump >= 0; bump -= 1) {
    const parts = [...seeds, Uint8Array.of(bump), program, PDA_MARKER];
    const buffer = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    for (const part of parts) {
      buffer.set(part, offset);
      offset += part.length;
    }
    const hash = sha256(buffer);
    if (!isOnCurve(hash)) return base58Encode(hash);
  }
  throw new Error('no valid program address');
}

/** The associated token account that holds `mint` for `owner`. */
export function associatedTokenAddress(owner: string, mint: string, tokenProgram: string): string {
  return findProgramAddress(
    [publicKeyBytes(owner), publicKeyBytes(tokenProgram), publicKeyBytes(mint)],
    ASSOCIATED_TOKEN_PROGRAM,
  );
}

/** ed25519 keys as Solana uses them: a 32-byte seed signs; the public key is the address. */
export const solanaKeys = {
  generateSeed: (randomBytes: (n: number) => Uint8Array) => randomBytes(32),
  publicKey: (seed: Uint8Array) => base58Encode(ed25519.getPublicKey(seed)),
  sign: (message: Uint8Array, seed: Uint8Array) => ed25519.sign(message, seed),
  verify: (signature: Uint8Array, message: Uint8Array, address: string) => {
    try {
      return ed25519.verify(signature, message, publicKeyBytes(address), { zip215: false });
    } catch {
      return false;
    }
  },
};
