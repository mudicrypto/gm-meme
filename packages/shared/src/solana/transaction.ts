import { base58Encode } from './base58';

// Solana wire format, just enough to read and sign a transaction:
// [compact-u16 n][n × 64-byte signatures][message]
// message (legacy):  header(3) | keys | blockhash(32) | instructions
// message (v0):      0x80 | header(3) | keys | blockhash | instructions | lookups

export interface CompiledInstruction {
  programId: string;
  /** Account addresses in instruction order. */
  accounts: string[];
  data: Uint8Array;
}

export interface DecodedTransaction {
  version: 'legacy' | 0;
  signatures: Uint8Array[];
  /** The exact bytes that get signed. */
  message: Uint8Array;
  numRequiredSignatures: number;
  numReadonlySigned: number;
  numReadonlyUnsigned: number;
  accountKeys: string[];
  recentBlockhash: string;
  instructions: CompiledInstruction[];
  /** v0 only; Sift's own transactions never use lookup tables. */
  addressTableLookups: number;
}

class Reader {
  offset = 0;
  constructor(readonly bytes: Uint8Array) {}
  u8(): number {
    if (this.offset >= this.bytes.length) throw new Error('transaction truncated');
    return this.bytes[this.offset++]!;
  }
  take(n: number): Uint8Array {
    if (this.offset + n > this.bytes.length) throw new Error('transaction truncated');
    const out = this.bytes.subarray(this.offset, this.offset + n);
    this.offset += n;
    return out;
  }
  compactU16(): number {
    let value = 0;
    for (let shift = 0; shift < 21; shift += 7) {
      const byte = this.u8();
      value |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return value;
    }
    throw new Error('bad compact-u16');
  }
}

export function decodeTransaction(bytes: Uint8Array): DecodedTransaction {
  const r = new Reader(bytes);
  const signatureCount = r.compactU16();
  const signatures = Array.from({ length: signatureCount }, () => Uint8Array.from(r.take(64)));
  const messageStart = r.offset;

  let version: DecodedTransaction['version'] = 'legacy';
  if (bytes[r.offset]! & 0x80) {
    const v = r.u8() & 0x7f;
    if (v !== 0) throw new Error(`unsupported transaction version ${v}`);
    version = 0;
  }
  const numRequiredSignatures = r.u8();
  const numReadonlySigned = r.u8();
  const numReadonlyUnsigned = r.u8();
  const accountKeys = Array.from({ length: r.compactU16() }, () => base58Encode(r.take(32)));
  const recentBlockhash = base58Encode(r.take(32));

  const instructions: CompiledInstruction[] = [];
  const instructionCount = r.compactU16();
  for (let i = 0; i < instructionCount; i += 1) {
    const programIndex = r.u8();
    const accountIndexes = Array.from({ length: r.compactU16() }, () => r.u8());
    const data = Uint8Array.from(r.take(r.compactU16()));
    const key = (index: number) => {
      const address = accountKeys[index];
      if (!address) throw new Error('instruction references a lookup-table account');
      return address;
    };
    instructions.push({ programId: key(programIndex), accounts: accountIndexes.map(key), data });
  }

  let addressTableLookups = 0;
  if (version === 0) {
    addressTableLookups = r.compactU16();
    for (let i = 0; i < addressTableLookups; i += 1) {
      r.take(32);
      r.take(r.compactU16());
      r.take(r.compactU16());
    }
  }
  if (r.offset !== bytes.length) throw new Error('unexpected bytes after transaction');
  if (signatureCount !== numRequiredSignatures) throw new Error('signature count mismatch');

  return {
    version,
    signatures,
    message: Uint8Array.from(bytes.subarray(messageStart)),
    numRequiredSignatures,
    numReadonlySigned,
    numReadonlyUnsigned,
    accountKeys,
    recentBlockhash,
    instructions,
    addressTableLookups,
  };
}

/** The transaction bytes with `signature` placed in the slot of signer `index`. */
export function withSignature(bytes: Uint8Array, index: number, signature: Uint8Array): Uint8Array {
  if (signature.length !== 64) throw new Error('signature must be 64 bytes');
  const r = new Reader(bytes);
  const count = r.compactU16();
  if (index >= count) throw new Error('no such signer');
  const out = Uint8Array.from(bytes);
  out.set(signature, r.offset + index * 64);
  return out;
}

// Hand-rolled so it runs the same everywhere (Node, Hermes, browsers) without globals.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = new Map([...B64].map((char, i) => [char, i]));

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/=+$/, '');
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const value = B64_INDEX.get(char);
    if (value === undefined) throw new Error('invalid base64');
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i]!, bytes[i + 1], bytes[i + 2]];
    out += B64[a >> 2]!;
    out += B64[((a & 3) << 4) | ((b ?? 0) >> 4)]!;
    out += b === undefined ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)]!;
    out += c === undefined ? '=' : B64[c & 63]!;
  }
  return out;
}

/** Little-endian u64 at `offset`. */
export function readU64(data: Uint8Array, offset: number): bigint {
  if (offset + 8 > data.length) throw new Error('instruction data too short');
  let value = 0n;
  for (let i = 7; i >= 0; i -= 1) value = (value << 8n) | BigInt(data[offset + i]!);
  return value;
}

export function readU32(data: Uint8Array, offset: number): number {
  if (offset + 4 > data.length) throw new Error('instruction data too short');
  // Addition, not `|`: bitwise operators wrap at 2^31 in JavaScript.
  return (
    data[offset]! +
    data[offset + 1]! * 2 ** 8 +
    data[offset + 2]! * 2 ** 16 +
    data[offset + 3]! * 2 ** 24
  );
}
