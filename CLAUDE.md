# Sift

Sift is a mobile-first Solana meme coin trading app built around **safety and social discovery**:
every token gets a traffic-light risk score with reasons and a plain-language AI summary, and
users can follow friends' trades. The full concept and build plan is in `docs/PLAN.md`; build it
one step at a time and stop after each step for the user to test.

## Non-negotiables

- **Custody only through the signing provider.** Sift wallets' keys live only in Privy.
  Sift never sees, stores or logs a private key or seed phrase (export is HPKE-encrypted
  straight to the phone). The server signs only through Privy, only transactions that pass
  `verifyTradeTransaction` (or `withdrawalProblems`) plus the user's caps and the provider
  policy, and never while the account or `SIFT_SIGNING_FROZEN` is frozen. Phantom and
  phone-wallet trades are still signed on the device. Sift wallet code lives in
  `apps/api/src/sift-wallet/`. Devnet only until an external audit and a custody licence.
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
| `supabase/`       | Postgres migrations (applied to Supabase)      |

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
- Database: never edit an applied migration; add a new file in `supabase/migrations/`. Tables get
  RLS with no policies; logic lives in SQL functions granted only to `service_role`, which the
  API calls through `rpc()`. `test/token-repository.test.ts` runs the same contract against the
  in-memory store and the real SQL (PGlite), so keep both in step.
- Data from Helius (names, symbols, image URLs) is attacker-controlled: validate it with zod,
  cap lengths, and only pass on `https:` URLs.
- Mobile: screens in `apps/mobile/src/app/` (Expo Router), components in `src/components/`, pure
  logic in `src/lib/` with Vitest tests. Inside `<Link asChild>`, give the child one flat style
  object (`StyleSheet.flatten`): on web it lands on an `<a>`, which can't take arrays or
  functions. Never label a token "safe".
- Trading: every transaction the API builds must pass `verifyTradeTransaction`
  (`packages/shared/src/solana/verify-trade.ts`), which the phone runs before signing. Extend
  its allow-list deliberately (with tamper tests in `apps/api/test/trading.test.ts`) when adding a
  venue; never loosen it to make a transaction pass. The fee wallet the app trusts comes from
  `EXPO_PUBLIC_FEE_WALLET`, never from the API. Keys: `apps/mobile/src/lib/keystore.ts` only.
- Social: users are wallets, signed in by signing `signInMessage` (`packages/shared/src/social.ts`)
  and holding a bearer token (stored hashed). Never put wallet addresses in public profile
  responses, and keep trade sharing opt-in. Social data lives in `apps/api/src/social/`, with
  the same in-memory/SQL contract test (`test/social-repository.test.ts`).
- Types used by both app and API live in `packages/shared`. It ships TypeScript source; the API
  bundles it with tsup and Metro resolves it directly.
- The risk score is the core of the product: keep it in our own code, each check pure and unit
  tested, and every result explained with a plain-language reason. Checks live in
  `apps/api/src/risk/checks.ts` as functions of `RiskInputs`; fetching lives in `gather.ts`. Missing
  data must produce amber, never green.
- Commit after each working step, with `pnpm check` passing.
