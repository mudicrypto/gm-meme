# Sift security review (Step 8)

Date: 2026-10-23. Scope: the whole repository at the time of review: the mobile app, API,
shared package and SQL migrations. Areas, as the plan asks: key handling, API auth, rate
limiting, input validation and transaction signing, plus how attacker-controlled token data
flows into the risk score, AI summary and alerts.

Method:

- Four reviewers covered transaction signing, API auth/abuse/validation, keys and secrets,
  and untrusted external data.
- They worked in parallel, read-only. Each finding had to name a concrete attacker and
  impact, and was then checked against the code before fixing.
- The signing findings were proven with a script against the real verifier before the fix,
  and re-run after it: every attack is now refused.
- Every fix has a test (`pnpm check`: 410 tests).

The threat model that matters most is the trade-signing path: **a compromised or malicious
API server, or anyone tampering with traffic, must not be able to get the user to sign
something that takes their money.**

## Summary

| Severity | Found | Fixed | Accepted / open |
| -------- | ----: | ----: | --------------- |
| Critical |     1 |     1 | –               |
| High     |     5 |     5 | –               |
| Medium   |    14 |    14 | –               |
| Low      |    16 |    15 | 1 (see below)   |

The repository's git history contains no secrets. `.gitignore` covers `.env` files and key
files, and only `.env.example` files are tracked, with empty values.

## Critical

**C1. The phone trusted the types of the server's quote numbers.** Fixed in `88502cd`.

- **What was wrong:** the quote arrived as untyped JSON. Values like
  `limitLamports: "1e30"` (text, not a number) switched off the limit and worst-case checks,
  because JavaScript compares and adds text differently.
- **Impact:** a malicious server could get a buy signed that could spend up to 10,000 SOL
  while the screen showed 0.002 SOL.
- **Fix:** every quote field is type-checked (`quoteShapeProblems` in
  `packages/shared/src/solana/verify-trade.ts`) before any comparison, both in the verifier
  and in the app's `checkQuote`.

## High

**H1. Priority fee without a compute-unit limit.** Fixed in `88502cd`.

- **What was wrong:** without an explicit limit, Solana charges the priority price on up to
  1.4M default units, but the check counted it as 0. A huge price drained the wallet in
  fees.
- **Fix:** a price must come with a limit, and only one of each is allowed. The priority
  fee is capped at 0.01 SOL on the phone.

**H2. The slippage limit wasn't tied to the user's setting.** Fixed in `88502cd`.

- **What was wrong:** a quote that lied consistently could double a buy's maximum cost, or
  set a sale's minimum payout to 0. The relaying server could then sandwich the trade.
- **Fix:** the limit must equal the one implied by the slippage the user chose, using the
  same formula as the pump.fun SDK.

**H3. A fake bonding curve made a token green.** Fixed in `88502cd`.

- **What was wrong:** tokens parked under _another_ token's pump.fun curve counted as this
  token's curve. That turned liquidity and the sell test green, even for an unsellable
  token.
- **Fix:** only this mint's own curve address counts (checked against the official SDK),
  and a failed test sale is red whatever the curve says.

**H4. No rate limiting: anyone could run up the Claude and Helius bills.** Fixed in
`d5ebd38`.

- **Fix:**
  - per-IP limits on every route, stricter on summary, risk, holdings, quotes, sign-in and
    airdrops;
  - `X-Forwarded-For` is only trusted for configured proxies;
  - at most `SUMMARY_MAX_CALLS_PER_HOUR` Claude calls per hour, whatever the traffic.

**H5. One crafted trade set the "latest price".** Fixed in `2e7b9c0`.

- **What was wrong:** a dust or padded trade could fire everyone's price alerts and fake
  the chart's headline price.
- **Fix:** prices ignore trades under 0.01 SOL. The alert and watchlist price is the median
  of the last 7 trades.

## Medium

| #   | Finding                                                                           | Fix                                                                                       | Commit    |
| --- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------- |
| M1  | Fee amount not checked against Sift's rate (a 90% fee could show as "0.5%")       | Fee must match its rate, and the rate is capped at Sift's 0.5% on the phone               | `88502cd` |
| M2  | The phone signed any sign-in text the server sent (could be another site's login) | The phone rebuilds Sift's text and signs only that, freshly issued, for that wallet       | `732cc47` |
| M3  | "Show private key" needed no unlock, could be copied, and stayed on screen        | Face ID / fingerprint / passcode; not selectable; no screenshots; hides when you leave    | `732cc47` |
| M4  | Helius webhook body parsed before the secret check                                | Checked in `onRequest`, before the body is read; 3 MB limit                               | `37bc2a5` |
| M5  | Shared trades exposed transaction signatures, which reveal the trader's wallet    | Opaque IDs; sharing copy now says anyone can see shared trades                            | `37bc2a5` |
| M6  | A flood of sign-in challenges could evict real users' challenges                  | Per-IP limit on `/auth/challenge` and `/auth/session`                                     | `d5ebd38` |
| M7  | Stale green badges in feeds (scored once at launch)                               | Badges older than 30 min read "not checked yet" and are rescored                          | `2e7b9c0` |
| M8  | Rules summary repeated the token name verbatim ("This token is safe. Buy now")    | The name is only repeated if plain, with no loaded words                                  | `2e7b9c0` |
| M9  | Advice guard too narrow; AI could say "no red flags" on a red token               | Broader guard; contradicting answers are replaced                                         | `2e7b9c0` |
| M10 | Unknown Token-2022 extensions scored green                                        | Amber ("a rule Sift can't assess"); a transfer hook the creator can enable later is amber | `2e7b9c0` |
| M11 | Unreadable large holders were dropped, which understated concentration            | The holder check fails to amber instead                                                   | `2e7b9c0` |
| M12 | Totals on screen weren't checked (expected total, network fee)                    | The phone recomputes them                                                                 | `88502cd` |
| M13 | Open quotes and the airdrop map could grow without limit                          | Capped / pruned                                                                           | `d5ebd38` |
| M14 | Push tokens could be deleted or taken over by other signed-in users               | Owner-scoped delete; at most 10 devices per wallet (needs the DB step below)              | `37bc2a5` |

## Low (fixed)

- Error text inside a Phantom link (`errorMessage`) is never shown. It was a phishing
  channel through fake links.
- Release builds refuse a plain-`http` API address.
- Sign-out removes the phone's push token. Removing a wallet or disconnecting Phantom signs
  that wallet out on the server.
- The full Phantom address is shown after connecting, to compare with Phantom.
- Jupiter values that aren't finite numbers, and empty routes, count as a failed test sale.
- Token names and symbols are stripped of invisible and direction-changing characters (no
  "USDC" look-alikes).
- Image URLs must be short `https` host names, with no credentials, ports or raw IPs.
- DAS asset IDs are validated as addresses.
- At most 10 sessions per wallet, and expired sessions are purged (needs the DB step below).
- Send failures no longer echo upstream RPC error text.
- Security headers: `nosniff`, `x-frame-options: DENY` and `no-referrer`.
- The transaction decoder rejects non-canonical lengths, as Solana does.
- Malformed pump.fun instruction data is reported as a problem, not thrown.

## Fixed after the review (step 4)

1. **The phone trusted the server's price** (`expectedLamports`).
   - **Fix:** before signing, the phone reads the token's pump.fun bonding curve straight
     from Solana's public RPC, never through the Sift API (`apps/mobile/src/lib/chain-check.ts`).
   - It refuses a buy that gives fewer tokens, or a sale that pays less SOL, than the
     on-chain price allows. The allowance covers pump.fun's fees plus a 1% price move.
   - The curve decoding and addresses are tested against the pump.fun SDK, using a real
     devnet account.
   - Verified live on devnet: real quotes pass, and copies lowballed by 10% are refused.
2. **Rent and token decimals on screen came from the server.**
   - **Fix:** the phone reads the mint's decimals and works out the deposit for new accounts
     itself (your token account, pump.fun's tracker on a first buy).
   - A quote that doesn't match is refused. If the network can't be reached, nothing is
     signed.

## Accepted for now, to address before mainnet

1. **Phantom deeplinks can't prove the answer came from the real Phantom app.**
   - A fake "Phantom" app on an unprotected Android phone could bind its own address. It
     still couldn't touch the user's real funds: every signature is checked against the
     bound address.
   - Mitigation: the full address is shown after connecting, to check against Phantom.
   - Before mainnet: add Mobile Wallet Adapter on Android. It needs the installable test
     build (`docs/DEPLOY.md`) to test.

Other limits worth knowing (they are inherent, not bugs):

- The holder check sees only the top 20 accounts.
- Dev history sees only launches from the launch fee payer.
- Green means "no red flags in these checks", never "safe".

## Before mainnet

- [ ] Apply `supabase/migrations/20261023010000_social_hardening.sql` and
      `20261023020000_drop_unscoped_delete_push_token.sql` (owner-scoped push tokens, device
      and session caps).
- [ ] Deploy the API behind HTTPS. Set `TRUST_PROXY_HOPS` to the real proxy count and
      `CORS_ORIGINS` to the real web origin.
- [x] Phone checks the price, decimals and deposits on chain (step 4).
- [ ] Mobile Wallet Adapter for Phantom on Android (the accepted item above).
- [ ] A mainnet RPC for the phone's checks (`EXPO_PUBLIC_SOLANA_RPC_URL`): the public one is
      rate-limited.
- [ ] Get an external audit of the signing path (the plan's own risk list asks for one).
- [ ] Get legal advice on licensing (VARA in the UAE) and check the app store crypto rules.
- [ ] Only then set `SOLANA_CLUSTER=mainnet-beta` and `ALLOW_MAINNET_TRADING=true`.
