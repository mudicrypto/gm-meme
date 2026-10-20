import {
  type TradeQuote,
  type TradeQuoteRequest,
  base64ToBytes,
  verifyTradeTransaction,
} from '@sift/shared';

/**
 * Everything the app checks before letting the user sign: the quote is for what they
 * asked, and the transaction does exactly what the quote says (see verifyTradeTransaction).
 * Any problem means: don't sign.
 */
export function checkQuote(
  quote: TradeQuote,
  request: TradeQuoteRequest,
  feeWallet: string | null,
): string[] {
  const problems: string[] = [];
  if (quote.mint !== request.mint) problems.push('quote is for a different token');
  if (quote.wallet !== request.wallet) problems.push('quote is for a different wallet');
  if (quote.side !== request.side) problems.push(`quote is not a ${request.side}`);
  if (quote.slippageBps !== request.slippageBps)
    problems.push('slippage differs from your setting');
  if (request.side === 'buy') {
    // The budget you entered covers the tokens and the platform fee.
    const spent = BigInt(quote.expectedLamports) + BigInt(quote.fees.platformLamports);
    if (spent !== BigInt(request.amount)) problems.push('amount differs from what you entered');
  } else if (quote.tokenAmount !== request.amount) {
    problems.push('selling a different amount than you chose');
  }
  if (feeWallet === null && quote.fees.platformLamports > 0)
    problems.push('unexpected platform fee');

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(quote.transaction);
  } catch {
    return [...problems, 'unreadable transaction'];
  }
  return [...problems, ...verifyTradeTransaction(bytes, quote, feeWallet).problems];
}
