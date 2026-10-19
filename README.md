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

### Accounts you'll need

Free tiers are enough for development:

- [Helius](https://www.helius.dev): Solana data (Step 2)
- [Supabase](https://supabase.com): Postgres database (Step 2)
- [Anthropic Console](https://console.anthropic.com): Claude API for summaries (Step 4)
- [Expo](https://expo.dev): mobile builds

Keys go in the `.env` files, which are gitignored. Never commit them.

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
