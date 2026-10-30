import { transferProblems } from '@sift/shared';

/**
 * Problems with a withdrawal before it goes to the signing provider; empty when it is exactly
 * one SOL transfer of `lamports` from the Sift wallet to the saved address, plus a small
 * priority fee, and nothing else.
 */
export function withdrawalProblems(
  transaction: string,
  expected: { from: string; to: string; lamports: number },
): string[] {
  return transferProblems(transaction, expected);
}
