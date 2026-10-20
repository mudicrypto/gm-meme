import { createRequire } from 'node:module';
import type * as PumpSdk from '@pump-fun/pump-sdk';

// The SDK's ESM build fails to load (@pump-fun/agent-payments-sdk imports `BN` from
// @coral-xyz/anchor's ESM entry, which doesn't export it). Its CommonJS build works.
const require = createRequire(import.meta.url);
export const pump = require('@pump-fun/pump-sdk') as typeof PumpSdk;
export type { BondingCurve, FeeConfig, Global } from '@pump-fun/pump-sdk';
