import { z } from 'zod';

const optionalSecret = z
  .string()
  .optional()
  .transform((value) => (value ? value : undefined));

const ConfigSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SOLANA_CLUSTER: z.enum(['devnet', 'mainnet-beta']).default('devnet'),
  // External service keys are optional until the step that needs them.
  HELIUS_API_KEY: optionalSecret,
  SUPABASE_URL: z
    .url()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  SUPABASE_SERVICE_ROLE_KEY: optionalSecret,
  ANTHROPIC_API_KEY: optionalSecret,
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
