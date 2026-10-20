# Sift

Trade new Solana tokens with your friends, with every token pre-checked for scams and explained
in plain language.

> Early development. Runs against **Solana devnet** only. Not financial advice.

See [`docs/PLAN.md`](docs/PLAN.md) for the concept, MVP scope and build plan.

## Repo layout

```
apps/
  api/       Node.js + Fastify API (discovery, risk score, AI summary, social, swap quotes)
  mobile/    Expo app for iOS and Android
packages/
  shared/    Types and helpers used by both
supabase/
  migrations/  Database schema (SQL)
docs/
  PLAN.md    Concept and step-by-step build plan
```

## Getting started

Requirements: Node.js 22+ and pnpm 10 (`corepack enable` picks up the pinned version).

```bash
pnpm install

# Environment: copy the examples and fill in keys as later steps need them
cp apps/api/.env.example apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env

pnpm dev:api      # http://localhost:3000/health
pnpm dev:mobile   # scan the QR code with Expo Go
```

When testing on a real phone, set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` to your computer's
LAN IP (for example `http://192.168.1.20:3000`), since `localhost` on the phone is the phone.

Without any keys the API still runs: it keeps tokens in memory and stores them without
names or images. Add keys as you go.

### Accounts you'll need

Free tiers are enough for development:

- [Helius](https://www.helius.dev): Solana data (Step 2)
- [Supabase](https://supabase.com): Postgres database (Step 2)
- [Anthropic Console](https://console.anthropic.com): Claude API for summaries (Step 4)
- [Expo](https://expo.dev): mobile builds

Keys go in the `.env` files, which are gitignored. Never commit them.

## Token discovery (Step 2)

The API learns about tokens from Helius and serves two feeds:

- `GET /tokens/new?limit=50`: tokens launched on the watched programs, newest first
- `GET /tokens/trending?limit=50&windowMinutes=60`: tokens ranked by **distinct traders** in the
  window (then swap count, then SOL volume). Ranking by traders, not raw volume, makes it harder
  for one wallet to wash-trade a token onto the list.

By default it watches the pump.fun program (`HELIUS_WATCH_ADDRESSES`).

### 1. Database (Supabase)

Run `supabase/migrations/20261019000000_token_discovery.sql` once: paste it into the Supabase
dashboard's SQL editor, or use `supabase db push` with the Supabase CLI. Then set `SUPABASE_URL`
and `SUPABASE_SERVICE_ROLE_KEY` in `apps/api/.env` (Project Settings → API). The tables have row
level security on with no policies and the functions are granted only to `service_role`, so
nothing is readable with the public anon key.

### 2. Getting transactions from Helius

Set `HELIUS_API_KEY`, then pick one:

- **Locally: polling.** Set `HELIUS_POLL_INTERVAL_MS=10000`. The API fetches the latest
  transactions every 10 seconds. No public URL needed.
- **Deployed: webhook.** Set `HELIUS_WEBHOOK_SECRET` to a long random string, deploy the API (or
  expose it with a tunnel such as `cloudflared tunnel --url http://localhost:3000`), then:

  ```bash
  pnpm --filter @sift/api helius:webhook https://<public-host>/webhooks/helius
  ```

  Helius sends the secret back in the `Authorization` header; requests without it get a 401.

Both paths are idempotent, so redelivered or overlapping transactions are stored once.

> **Devnet note:** pump.fun runs on devnet too, so the feeds fill up, but much of the activity
> is test bots (expect lots of near-identical tokens). Real launches happen on mainnet.

## Risk score (Step 3)

`GET /tokens/:mint/risk` returns a traffic-light level (the worst of its checks), one plain-language
reason per check, and a not-financial-advice disclaimer. Checks:

| Check                  | Red when                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| `mint_authority`       | someone can still mint more tokens                                                                  |
| `freeze_authority`     | someone can freeze holders' tokens                                                                  |
| `token_extensions`     | Token-2022 rules that can trap or take tokens (transfer hooks, permanent delegates, >10% fees, ...) |
| `holder_concentration` | top 10 wallets hold 50%+ or one wallet 20%+ (pools and burns excluded)                              |
| `liquidity`            | no liquidity pool found (green while on pump.fun's bonding curve)                                   |
| `dev_history`          | the creator's wallet launched 5+ other tokens                                                       |
| `sell_test`            | a test sale of 0.1% of supply finds no route or drops the price 30%+                                |

Anything Sift couldn't verify is amber, never green. Results are cached for 60 seconds (10 when a
data source failed). The test sale uses Jupiter quotes, which only exist on mainnet; on devnet it
is skipped, except that pump.fun's bonding curve always buys tokens back. Full transaction
simulation arrives with trading in Step 6.

## AI summary (Step 4)

`GET /tokens/:mint/summary` returns about three plain-language sentences plus a list of red
flags, the risk level and the disclaimer. With `ANTHROPIC_API_KEY` set, Claude (`SUMMARY_MODEL`,
default `claude-opus-5-5`) writes it from the risk checks and the last hour / 24 hours of
trading activity; results are cached for 5 minutes. Safeguards:

- The prompt forbids buy/sell/hold advice, price predictions and calling a token safe, and a
  pattern check rejects answers that read as advice anyway.
- Token names and symbols are creator-controlled: they are passed only inside an escaped
  `<token_data>` JSON block that the model is told never to obey.
- Only tokens Sift tracks get AI summaries, so arbitrary lookups can't run up the bill.
- If Claude declines, fails or is not configured, a rules-based summary built from the risk
  checks is returned instead (`"source": "rules"`).

## Mobile app (Step 5)

Three screens, built with Expo Router (`apps/mobile/src/app/`):

- **Discover**: Trending (most distinct traders in the last hour) and New launches, each with a
  risk badge. New tokens are scored in the background as they're discovered.
- **Token**: price and chart (from trades Sift recorded), the plain-language summary, the risk
  checks, and Buy/Sell (disabled until wallet connection in Step 6).
- **Portfolio**: watch any wallet address, read-only, with risk badges for its tokens.

**Simple / Pro** (top right, remembered on the device): Simple shows the essentials in plain
words; Pro adds every check, volumes and full addresses. Badges never say "safe": green reads
"No red flags".

Run it with `pnpm dev:api` and `pnpm dev:mobile`, then open it in Expo Go, or press `w` for the
web version (the API allows `http://localhost:8081` via `CORS_ORIGINS`).

## Wallet and trading (Step 6)

Non-custodial, devnet only for now:

- **Embedded wallet** (Portfolio → Create wallet): a key generated on the phone and kept in the
  iOS Keychain / Android Keystore (this device only, not in backups). It never leaves the
  phone; "Show private key" exports it in the format Phantom and Solflare import. The web build
  keeps the key in memory only, for testing. Phantom connection comes next.
- **Trading** on pump.fun's bonding curve through `@pump-fun/pump-sdk`:
  1. `POST /trades/quote` builds an unsigned transaction and simulates it, then returns the full
     cost: tokens, Sift fee (0.5% with `FEE_WALLET` set), priority fee, network fee, one-off
     token account rent, slippage limit, expected total and worst case.
  2. The app checks the transaction on the phone (`verifyTradeTransaction` in
     `packages/shared`): only the quoted trade, your own token account, and one fee transfer to
     the fee wallet built into the app. Anything else and it refuses to sign.
  3. The phone signs; `POST /trades/submit` relays only the exact transaction quoted.
- Tokens that left the bonding curve trade through Jupiter, which turns on with mainnet.
- Test SOL: Portfolio → "Get 1 test SOL" (Solana's public faucet, often rate-limited), or
  https://faucet.solana.com.

To charge the fee, set the same public address in `FEE_WALLET` (API) and `EXPO_PUBLIC_FEE_WALLET`
(app); if they differ, the app refuses every trade. Fund the fee wallet once with at least
0.001 SOL: Solana won't open an account from a fee smaller than its rent deposit, so until then
the API charges no fee (and logs an error) rather than fail every trade.

Verified on devnet: a first buy and full sell from a fresh wallet matched the quoted totals to the
lamport, including the 0.5% fee and the deposits for new accounts.

## Scripts

| Command           | What it does                                  |
| ----------------- | --------------------------------------------- |
| `pnpm check`      | Format check, lint, typecheck and all tests   |
| `pnpm test`       | Vitest in every package                       |
| `pnpm lint`       | ESLint (typescript-eslint, React Hooks rules) |
| `pnpm typecheck`  | `tsc` in every package                        |
| `pnpm format`     | Prettier                                      |
| `pnpm dev:api`    | API with hot reload                           |
| `pnpm dev:mobile` | Expo dev server                               |

Build the API for production with `pnpm --filter @sift/api build`, then
`pnpm --filter @sift/api start`.

## Security model

Sift is non-custodial: private keys stay in the user's wallet on their phone, and every
transaction is signed there. The API never sees a key.
