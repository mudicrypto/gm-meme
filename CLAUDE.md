# Sift

Sift is a mobile-first Solana meme coin trading app built around **safety and social discovery**:
every token gets a traffic-light risk score with reasons and a plain-language AI summary, and
users can follow friends' trades. The full concept and build plan is in `docs/PLAN.md`; build it
one step at a time and stop after each step for the user to test.

## Non-negotiables

- **Non-custodial only.** Sift never holds, receives, stores or logs private keys or seed
  phrases. Transactions are built server-side at most, and are always signed on the user's
  device (Phantom via Mobile Wallet Adapter, or the embedded wallet).
- **Devnet until Step 8.** Default `SOLANA_CLUSTER` is `devnet`. Don't point anything at mainnet
  before the security review is done.
- **Secrets stay in `.env`**, which is gitignored. Only `.env.example` files are committed.
  Server-only keys (Helius, Supabase service role, Anthropic) never go into the mobile app;
  `EXPO_PUBLIC_*` variables are public.
- **Show full cost before any trade**: platform fee, priority fee, expected slippage, minimum
  received.
- **Not financial advice.** AI summaries and risk scores describe facts and red flags; they
  never tell users to buy or sell.
- **Not building:** sniping bots that front-run users, or MEV sandwich strategies.

## Stack

| Path              | What                                           |
| ----------------- | ---------------------------------------------- |
| `apps/mobile`     | Expo (React Native, TypeScript), iOS + Android |
| `apps/api`        | Node.js + Fastify API (TypeScript, ESM)        |
| `packages/shared` | Types and helpers shared by app and API        |

External services: Helius (Solana data), Supabase (Postgres), Jupiter (swap routing),
Claude API (summaries).

## Commands (run from the repo root)

```bash
pnpm install          # install everything (pnpm workspaces, hoisted node_modules for Expo)
pnpm dev:api          # API with reload on http://localhost:3000
pnpm dev:mobile       # Expo dev server
pnpm check            # format check + lint + typecheck + tests: run before every commit
pnpm test             # tests in all packages (Vitest)
pnpm lint:fix && pnpm format
```

In `apps/mobile`, add packages with `npx expo install <pkg>` so versions match the Expo SDK, and
read `apps/mobile/AGENTS.md` before touching Expo APIs.

## Conventions

- TypeScript strict everywhere, including `noUncheckedIndexedAccess`. No `any`.
- Validate all external input at the boundary: zod for request params and env, `isSolanaAddress`
  from `@sift/shared` for mints and wallets.
- API: `buildApp(config)` in `apps/api/src/app.ts` builds the Fastify instance without listening;
  routes are Fastify plugins in `src/routes/`, tested with `app.inject()` in `apps/api/test/`.
- Mock every external service (Helius, Supabase, Jupiter, Claude) in tests; tests never hit the
  network.
- Types used by both app and API live in `packages/shared`. It ships TypeScript source; the API
  bundles it with tsup and Metro resolves it directly.
- The risk score is the core of the product: keep it in our own code, each check pure and unit
  tested, and every result explained with a plain-language reason.
- Commit after each working step, with `pnpm check` passing.
