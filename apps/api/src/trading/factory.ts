import { LAMPORTS_PER_SOL } from '@sift/shared';
import { Connection, PublicKey } from '@solana/web3.js';
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../config';
import { heliusRpcUrl } from '../helius/client';
import { createPriorityFeeEstimator } from './priority';
import { createPumpTrader } from './pump-trader';
import { type TradeService, createTradeService } from './service';

export function createDefaultTradeService(
  config: Config,
  apiKey: string,
  log: Pick<FastifyBaseLogger, 'error'>,
): TradeService {
  const rpcUrl = heliusRpcUrl(config.SOLANA_CLUSTER, apiKey);
  const connection = new Connection(rpcUrl, 'confirmed');
  return createTradeService({
    connection,
    pump: createPumpTrader(connection),
    estimatePriorityFee: createPriorityFeeEstimator({ rpcUrl }),
    feeWallet: config.FEE_WALLET ?? null,
    platformFeeBps: config.PLATFORM_FEE_BPS,
    log,
  });
}

/** Devnet faucet: returns the airdrop signature. */
export type Airdrop = (address: string) => Promise<string>;

// Helius doesn't serve devnet airdrops; Solana's public faucet does (when not rate-limited).
const PUBLIC_DEVNET_RPC = 'https://api.devnet.solana.com';
const AIRDROP_LAMPORTS = LAMPORTS_PER_SOL;

export function createAirdrop(_config: Config): Airdrop {
  const connection = new Connection(PUBLIC_DEVNET_RPC, 'confirmed');
  return (address) => connection.requestAirdrop(new PublicKey(address), AIRDROP_LAMPORTS);
}
