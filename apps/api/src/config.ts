import { PUMP_FUN_PROGRAM_ID, SIFT_FEE_WALLET, isSolanaAddress } from '@sift/shared';
import { z } from 'zod';

const optionalSecret = z
  .string()
  .optional()
  .transform((value) => (value ? value : undefined));

const addressList = z
  .string()
  .optional()
  .transform((value, ctx) => {
    const addresses = (value || PUMP_FUN_PROGRAM_ID)
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    for (const address of addresses) {
      if (!isSolanaAddress(address)) {
        ctx.addIssue({ code: 'custom', message: `not a Solana address: ${address}` });
      }
    }
    return addresses;
  });

const ConfigSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    HOST: z.string().default('0.0.0.0'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    SOLANA_CLUSTER: z.enum(['devnet', 'mainnet-beta']).default('devnet'),
    // External service keys are optional until the step that needs them.
    HELIUS_API_KEY: optionalSecret,
    // Shared secret Helius sends in the Authorization header of every webhook delivery.
    HELIUS_WEBHOOK_SECRET: optionalSecret.refine((value) => !value || value.length >= 24, {
      message: 'must be at least 24 characters',
    }),
    // Programs/accounts whose transactions we watch for launches and swaps.
    HELIUS_WATCH_ADDRESSES: addressList,
    // Poll Helius instead of (or as well as) receiving webhooks. 0 = off. Handy locally,
    // where Helius can't reach a webhook on localhost.
    HELIUS_POLL_INTERVAL_MS: z.coerce
      .number()
      .int()
      .refine((ms) => ms === 0 || ms >= 2000, { message: 'must be 0 (off) or at least 2000' })
      .default(0),
    // Jupiter quotes power the risk score's test sale (mainnet only).
    JUPITER_API_URL: z.url().default('https://lite-api.jup.ag/swap/v1'),
    JUPITER_API_KEY: optionalSecret,
    SUPABASE_URL: z
      .url()
      .optional()
      .or(z.literal('').transform(() => undefined)),
    SUPABASE_SERVICE_ROLE_KEY: optionalSecret,
    ANTHROPIC_API_KEY: optionalSecret,
    // Model for AI token summaries.
    SUMMARY_MODEL: z.string().min(1).default('claude-opus-5-5'),
    // Platform fee wallet, a public address (never a key). Unset: Sift's. Empty: no fee.
    FEE_WALLET: z
      .string()
      .default(SIFT_FEE_WALLET)
      .transform((value) => (value ? value : undefined))
      .refine((value) => value === undefined || isSolanaAddress(value), {
        message: 'not a Solana address',
      }),
    PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(100).default(50),
    // Trading stays devnet-only until the security review (Step 8) sets this.
    ALLOW_MAINNET_TRADING: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    // Browser origins allowed to call the API (the native app needs none). Comma-separated.
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:8081')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
  })
  .refine((config) => !config.SUPABASE_URL === !config.SUPABASE_SERVICE_ROLE_KEY, {
    message: 'set both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or neither',
    path: ['SUPABASE_URL'],
  });

export type Config = z.infer<typeof ConfigSchema>;

/** Parse and validate config from the environment. Throws with every problem listed. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid API config:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
