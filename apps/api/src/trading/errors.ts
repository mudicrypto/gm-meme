export type TradeErrorCode =
  | 'NOT_PUMP_TOKEN'
  | 'CURVE_COMPLETE'
  | 'INSUFFICIENT_SOL'
  | 'INSUFFICIENT_TOKENS'
  | 'AMOUNT_TOO_SMALL'
  | 'SIMULATION_FAILED'
  | 'QUOTE_NOT_FOUND'
  | 'TRANSACTION_MISMATCH'
  | 'BAD_SIGNATURE'
  | 'SEND_FAILED'
  | 'TRADING_DISABLED';

/** A trade problem the user can understand and act on. Message is shown as is. */
export class TradeError extends Error {
  override name = 'TradeError';
  constructor(
    readonly code: TradeErrorCode,
    message: string,
  ) {
    super(message);
  }
}
