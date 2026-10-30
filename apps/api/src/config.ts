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
    // Requests per minute per IP address for ordinary routes (expensive ones are stricter).
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(120),
    // Proxies in front of the API (load balancer etc.), so rate limits see the real client IP.
    // 0 = connected directly. Never set it higher than the real number of hops.
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    // Hard cap on Claude calls for summaries; past it, summaries are rules-based.
    SUMMARY_MAX_CALLS_PER_HOUR: z.coerce.number().int().min(0).default(300),
    // How often to check price alerts. 0 = off.
    ALERT_CHECK_INTERVAL_MS: z.coerce
      .number()
      .int()
      .refine((ms) => ms === 0 || ms >= 10_000, { message: 'must be 0 (off) or at least 10000' })
      .default(60_000),
    // Sift wallet signing provider (Privy). All four, or none (then no Sift wallets).
    // PRIVY_AUTHORIZATION_KEY is the private half of the key that owns the wallets: it signs
    // requests to Privy, but it is not a wallet key and cannot sign transactions by itself.
    PRIVY_APP_ID: optionalSecret,
    PRIVY_APP_SECRET: optionalSecret,
    PRIVY_AUTHORIZATION_KEY: optionalSecret,
    PRIVY_OWNER_ID: optionalSecret,
    // Emergency switch: true stops all Sift wallet signing (orders, trades, withdrawals).
    SIFT_SIGNING_FROZEN: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    // How often the order engine checks prices. 0 = off.
    ORDER_CHECK_INTERVAL_MS: z.coerce
      .number()
      .int()
      .refine((ms) => ms === 0 || ms >= 5_000, { message: 'must be 0 (off) or at least 5000' })
      .default(15_000),
    // Shown on the public privacy, terms and support pages (app store listings link them).
    SUPPORT_EMAIL: z
      .email()
      .optional()
      .or(z.literal('').transform(() => undefined)),
    // The legal name of the company that runs Sift, for those pages.
    OPERATOR_NAME: z
      .string()
      .trim()
      .max(120)
      .optional()
      .transform((value) => value || undefined),
    // Optional: Expo push access token, if "enhanced push security" is on for the project.
    EXPO_ACCESS_TOKEN: optionalSecret,
    // This server's public https address. When set (Render sets RENDER_EXTERNAL_URL itself),
    // the API registers its Helius webhook at startup.
    PUBLIC_URL: z
      .url()
      .optional()
      .or(z.literal('').transform(() => undefined)),
    RENDER_EXTERNAL_URL: z
      .url()
      .optional()
      .or(z.literal('').transform(() => undefined)),
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
  .superRefine((config, ctx) => {
    // All four Privy values, or none. Name the missing ones (names only, never values).
    const privy = {
      PRIVY_APP_ID: config.PRIVY_APP_ID,
      PRIVY_APP_SECRET: config.PRIVY_APP_SECRET,
      PRIVY_AUTHORIZATION_KEY: config.PRIVY_AUTHORIZATION_KEY,
      PRIVY_OWNER_ID: config.PRIVY_OWNER_ID,
    };
    const missing = Object.entries(privy)
      .filter(([, value]) => !value)
      .map(([name]) => name);
    if (missing.length > 0 && missing.length < 4)
      ctx.addIssue({
        code: 'custom',
        message: `set all of PRIVY_APP_ID, PRIVY_APP_SECRET, PRIVY_AUTHORIZATION_KEY and PRIVY_OWNER_ID, or none (missing: ${missing.join(', ')})`,
        path: ['PRIVY_APP_ID'],
      });
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
