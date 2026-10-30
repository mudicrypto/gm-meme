import { COMPUTE_BUDGET_PROGRAM, SYSTEM_PROGRAM } from './keys';
import { base64ToBytes, decodeTransaction } from './transaction';

const MAX_TRANSFER_PRIORITY_MICRO_LAMPORTS = 1_000_000n;

function readU32(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(offset, true);
}

function readU64(data: Uint8Array, offset: number): bigint {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(offset, true);
}

/** How the problems name the two sides (the Sift wallet's withdrawals by default). */
export interface TransferWords {
  payer: string;
  recipient: string;
}

/**
 * Problems with a SOL transfer before anyone signs it; empty when it is exactly one SOL
 * transfer of `lamports` from `from` to `to`, plus a small priority fee, and nothing else.
 * The server checks Sift wallet withdrawals with it; the phone checks a send it is about
 * to sign.
 */
export function transferProblems(
  transaction: string,
  expected: { from: string; to: string; lamports: number },
  words: TransferWords = { payer: 'the Sift wallet', recipient: 'the saved address' },
): string[] {
  let tx: ReturnType<typeof decodeTransaction>;
  try {
    tx = decodeTransaction(base64ToBytes(transaction));
  } catch {
    return ['unreadable transaction'];
  }
  const problems: string[] = [];
  if (tx.addressTableLookups > 0) problems.push('uses address lookup tables');
  if (tx.numRequiredSignatures !== 1 || tx.accountKeys[0] !== expected.from)
    problems.push(`not paid by ${words.payer} alone`);

  let transfers = 0;
  for (const ix of tx.instructions) {
    if (ix.programId === COMPUTE_BUDGET_PROGRAM) {
      const tag = ix.data[0];
      if (tag === 2 && ix.data.length === 5) continue;
      if (tag === 3 && ix.data.length === 9) {
        if (readU64(ix.data, 1) > MAX_TRANSFER_PRIORITY_MICRO_LAMPORTS)
          problems.push('priority fee too high');
        continue;
      }
      problems.push('unexpected compute budget instruction');
    } else if (ix.programId === SYSTEM_PROGRAM) {
      const isTransfer = ix.data.length === 12 && readU32(ix.data, 0) === 2;
      if (!isTransfer) {
        problems.push('unexpected system instruction');
        continue;
      }
      transfers += 1;
      const [from, to] = ix.accounts;
      if (from !== expected.from) problems.push(`transfer not from ${words.payer}`);
      if (to !== expected.to) problems.push(`transfer not to ${words.recipient}`);
      if (readU64(ix.data, 4) !== BigInt(expected.lamports)) problems.push('wrong amount');
    } else {
      problems.push(`unexpected program ${ix.programId}`);
    }
  }
  if (transfers !== 1) problems.push('must be exactly one transfer');
  return [...new Set(problems)];
}
