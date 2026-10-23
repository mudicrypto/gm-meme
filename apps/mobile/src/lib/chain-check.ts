import {
  ASSOCIATED_TOKEN_PROGRAM,
  TOKEN_2022_PROGRAM,
  TOKEN_PROGRAM,
  type TradeQuote,
  associatedTokenAddress,
  base64ToBytes,
  curvePriceProblems,
  decodeTransaction,
  parseBondingCurve,
  pumpBondingCurveAddress,
  pumpVolumeAccumulatorAddress,
} from '@sift/shared';

/** What the phone reads from Solana itself, never through the Sift API. */
export interface ChainReader {
  accounts(addresses: readonly string[]): Promise<({ owner: string; data: Uint8Array } | null)[]>;
  rentExempt(space: number): Promise<number>;
}

// Solana's public RPC for the cluster this build trades on. A mainnet build must set its
// own (EXPO_PUBLIC_SOLANA_RPC_URL): the public mainnet endpoint is heavily rate-limited.
export const SOLANA_RPC_URL =
  process.env.EXPO_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

export function createRpcReader(url = SOLANA_RPC_URL, fetchFn: typeof fetch = fetch): ChainReader {
  let id = 0;
  async function call<T>(method: string, params: unknown[]): Promise<T> {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
    });
    if (!res.ok) throw new Error(`Solana RPC ${res.status}`);
    const body = (await res.json()) as { result?: T; error?: { message?: string } };
    if (body.error || body.result === undefined) throw new Error('Solana RPC error');
    return body.result;
  }
  return {
    async accounts(addresses) {
      const result = await call<{
        value: ({ owner: string; data: [string, string] } | null)[];
      }>('getMultipleAccounts', [addresses, { encoding: 'base64', commitment: 'confirmed' }]);
      return result.value.map((account) =>
        account ? { owner: account.owner, data: base64ToBytes(account.data[0]) } : null,
      );
    },
    rentExempt: (space) => call<number>('getMinimumBalanceForRentExemption', [space]),
  };
}

// Offset of `decimals` in an SPL / Token-2022 mint account, and the account sizes a buy
// may open (as the API prices them).
const MINT_DECIMALS_OFFSET = 44;
const TOKEN_ACCOUNT_SPACE = { spl: 165, token2022: 170 } as const;
const VOLUME_ACCUMULATOR_SPACE = 137;

/**
 * Check what the quote says against the chain: the price (pump.fun's curve), the token's
 * decimals (so the amount on screen is real), and the deposit for new accounts.
 */
export async function onChainProblems(quote: TradeQuote, chain: ChainReader): Promise<string[]> {
  const curveAddress = pumpBondingCurveAddress(quote.mint);
  const accumulatorAddress = pumpVolumeAccumulatorAddress(quote.wallet);
  const [curveAccount, mintAccount, accumulator] = await chain.accounts([
    curveAddress,
    quote.mint,
    accumulatorAddress,
  ]);
  if (!mintAccount || mintAccount.data.length <= MINT_DECIMALS_OFFSET) {
    return ['the token was not found on chain'];
  }
  const curve = curveAccount ? parseBondingCurve(curveAccount.data) : null;
  if (!curve) return ['this token’s pump.fun curve was not found on chain'];

  const problems = curvePriceProblems(quote, curve);
  if (mintAccount.data[MINT_DECIMALS_OFFSET] !== quote.tokenDecimals) {
    problems.push('token decimals differ from the chain, so the amount shown is wrong');
  }

  // Deposits: your token account, if this trade opens it, and pump.fun's tracker on a
  // first buy.
  const tokenProgram = mintAccount.owner;
  if (tokenProgram !== TOKEN_PROGRAM && tokenProgram !== TOKEN_2022_PROGRAM) {
    return [...problems, 'the token is not a standard Solana token'];
  }
  const opensTokenAccount = decodeTransaction(base64ToBytes(quote.transaction)).instructions.some(
    (ix) => ix.programId === ASSOCIATED_TOKEN_PROGRAM,
  );
  const [tokenAccount] = opensTokenAccount
    ? await chain.accounts([associatedTokenAddress(quote.wallet, quote.mint, tokenProgram)])
    : [null];
  const spaces: number[] = [];
  if (opensTokenAccount && !tokenAccount) {
    spaces.push(
      tokenProgram === TOKEN_2022_PROGRAM ? TOKEN_ACCOUNT_SPACE.token2022 : TOKEN_ACCOUNT_SPACE.spl,
    );
  }
  if (quote.side === 'buy' && !accumulator) spaces.push(VOLUME_ACCUMULATOR_SPACE);
  const rents = await Promise.all(spaces.map((space) => chain.rentExempt(space)));
  const rent = rents.reduce((total, lamports) => total + lamports, 0);
  if (rent !== quote.fees.accountRentLamports) {
    problems.push('the deposit for new accounts differs from what the chain says');
  }
  return problems;
}
