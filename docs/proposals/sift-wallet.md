# Proposal: the Sift wallet (custodial, GMGN-style)

Status: **waiting for founder approval. Nothing here is built.**
Date: 2026-10-24. Scope: devnet only until an external security audit and a custody licence.

## 1. What changes, in one paragraph

Today every trade is signed on the user's phone, and Sift never holds a key. With the Sift
wallet, a wallet is created for each user at sign-up, and **Sift's server can sign trades from
it**, so limit, stop-loss and take-profit orders run even when the phone is off. The key itself
lives in a signing provider's secure hardware, never in Sift's database, logs, env files or
app. Users can export their key (behind 2FA and a warning), withdraw to a saved address, and
optionally connect Phantom for manual trades that they sign on the phone as today.

This makes Sift **custodial**: Sift can move users' funds. That is the founder's decision
(DESIGN.md section 3), and it has consequences worth stating plainly:

- `CLAUDE.md`'s first rule ("Non-custodial only") has to be rewritten. Proposed wording is in
  section 10. I will only change it after approval.
- App copy that says "your key never leaves your device" must change everywhere.
- Regulators and app stores treat this differently from today (section 9).

## 2. Signing provider

|                     | **Privy** (server wallets + policies)                                 | **Turnkey** (sub-orgs + policies)                                          | **Fireblocks**                     |
| ------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------- |
| How keys are held   | Split key, rebuilt only inside AWS Nitro enclaves                     | Inside secure enclaves (TEEs)                                              | MPC, institutional                 |
| Policy engine       | Deny-by-default rules per Solana instruction; signers can be removed  | Most expressive: can inspect Solana programs, accounts and token transfers | Rich, but built for treasury desks |
| Made for this?      | Docs name "limit orders… while a user is offline"                     | Docs name "limit orders"; Axiom runs on it                                 | Exchanges and funds                |
| Key export          | Yes                                                                   | Yes                                                                        | Not a consumer feature             |
| Expo / React Native | Yes                                                                   | Yes                                                                        | No consumer SDK                    |
| Devnet              | Yes (it signs bytes; Sift sends through its own RPC)                  | Yes (same)                                                                 | Sandbox, enterprise onboarding     |
| Price (Oct 2026)    | Free to 500 monthly users and 50K signatures, then $299 or $499/month | $0.10 per signature, or $99/month + $0.05                                  | Sales quote only (not public)      |
| Owner               | Stripe (acquired 2025)                                                | Independent                                                                | Independent                        |

Sources: Privy and Turnkey docs and pricing pages, as cited in
`reports/GMGN style limit and stop orders.md`.

**Recommendation: Privy, confirmed by a 2-day devnet spike.**

- **Cost:** at 1,000 users making 30 trades a month (30K signatures), Privy is $299–$499.
  Turnkey would be about $99 + $1,500.
- **Policies:** Privy's are deny-by-default and enforced inside the enclave. A Sift bug or a
  stolen server key can only sign what the policy allows.
- **Spike:** before committing, check on devnet that **both** Privy and Turnkey can express the
  five must-have rules in section 3.3. If Privy can't and Turnkey can, pick Turnkey and accept
  the higher cost.
- **Fireblocks:** not recommended. It is built for institutions, its pricing isn't public, and
  it has no consumer key export.

## 3. Key and policy design

### 3.1 Who controls what

Each user's Sift wallet has two kinds of authority:

| Authority          | Held by                                                                                    | Can do                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| **Owner**          | The user: a passkey (Face ID / fingerprint) on their phone, plus a TOTP authenticator code | Export the key, change the saved withdrawal address, change limits, remove Sift's signer  |
| **Trading signer** | Sift's order engine (a server key registered with the provider, not a wallet key)          | Sign **only** transactions the policy allows: trades and withdrawals to the saved address |

Sift staff and Sift's servers never see the wallet's private key. The trading signer's own
credential lives in the hosting provider's secret store (Render env), never in code or logs.
It can be rotated, and revoking it at the provider stops all signing.

### 3.2 What the trading signer may sign (the policy)

Everything not listed is refused by the provider, whatever Sift's server asks:

1. **Programs:** only pump.fun, PumpSwap, Jupiter (once on mainnet), Compute Budget, Associated
   Token Account, and System Program.
2. **SOL transfers:** only to Sift's fee wallet (fixed, the same one the phone checks today),
   and only to the user's **saved withdrawal address**.
3. **Token transfers:** none, except inside the swap programs above.
4. **Priority fee:** capped at 0.01 SOL, the same cap the phone uses today.
5. **Size caps:** per transaction, at most the user's per-order cap (default 1 SOL on devnet).

Before any transaction reaches the provider, Sift's server also runs the **same
`verifyTradeTransaction` check the phone runs today**, with the same allow-list. Then the
provider's policy checks it again. Two independent locks.

### 3.3 Must-have rules the spike must prove (per provider)

1. Refuse any program not on the list.
2. Refuse a SOL transfer to any address except the fee wallet and the saved withdrawal address.
3. Refuse a transfer above the cap.
4. Refuse the signature when the user's account is frozen.
5. A policy change (new address, higher cap) needs the user's owner passkey, not Sift's key.

If a rule can't be expressed in the provider's policy, it is enforced in Sift's server only,
and this document will say so.

### 3.4 Export private key

- Needs the owner passkey, a TOTP code, and a full-screen warning: "Anyone with this key can
  take everything. Sift staff will never ask for it."
- The key is decrypted by the provider straight onto the phone (end-to-end encrypted to a
  one-time key the phone makes). Sift's server never sees it.
- Same protections as today's "Show private key": no screenshots, not selectable, hidden when
  the app goes to the background.
- An email and push notification follow every export.

### 3.5 Withdrawals

- Withdraw only to a **saved address**, with a TOTP code each time.
- Adding or changing the saved address, or changing 2FA, starts a **24-hour wait** before
  withdrawals are allowed. The user gets a push and an email with a "this wasn't me, freeze my
  account" link.
- The 24-hour wait is enforced in Sift's server. The address change itself needs the user's
  passkey at the provider, so a compromised Sift server can't add an attacker's address.

### 3.6 Limits, alerts and the freeze switch

- **Per-order cap and daily cap**, set by the user. Raising them needs 2FA and takes effect
  after 24 hours. Lowering them is instant.
- **Rate limits:** at most N orders per minute per user, and a global limit.
- **Unusual-activity alerts** (push + email):
  - a new device signs in;
  - many orders in a short time;
  - a buy of a token rated red;
  - the daily cap is 80% used.
- **Auto-buys never go into red tokens.** Manual buys of red tokens still need the
  "I understand" switch.
- **Emergency "freeze all signing":** a single flag checked before every signature, plus
  revoking the trading signer at the provider. The second step works even if Sift's own code
  is broken. Who can flip it: the founder and one named engineer, with both actions logged.
- **Per-user freeze:** from the app, or from the "this wasn't me" link.
- **Circuit breaker:** if more than a set share of all open stop orders trigger within one
  minute (a sign of bad price data or an attack), the engine pauses and pages a human.

### 3.7 Phantom (optional)

Phantom stays connected for **manual** trades only, signed on the phone with today's checks:
the verifier, the on-chain price check, and Mobile Wallet Adapter on Android. Auto orders
always run from the Sift wallet, never from Phantom.

## 4. Sign-in and sessions (lessons from GMGN's October 2025 incident)

Phishers stole GMGN session tokens and made GMGN's servers buy honeypot tokens with ~107
users' SOL. No key leaked. So for Sift, **a stolen login must not be enough to spend money**:

- Each phone makes a **device key** (kept in the phone's secure storage) at sign-in, and
  signs every order and withdrawal request with it. A copied bearer token on its own can't
  place orders.
- New devices are limited for 24 hours: they can view and sell, but not withdraw or raise
  limits. The user is alerted.
- Sessions expire, and "sign out everywhere" revokes all device keys.

## 5. Order engine

A separate background **worker** next to the API:

- **Price monitoring:**
  - Helius webhooks (already running for swaps) feed the trades of every token with an open
    order.
  - The trigger price uses Sift's robust price: the median of the last 7 trades of at least
    0.01 SOL.
  - A trigger must hold for 2 consecutive readings, so one crafted trade can't fire it.
  - Tokens without enough trades show "may not trigger" (amber), never a silent promise.
- **Order types (first version):**
  - limit buy;
  - take-profit;
  - stop-loss;
  - the "Protect this trade" preset: sell all if down 30%, sell half when it doubles.
  - Trailing stop comes later.
- **Execution:**
  1. Build the transaction with today's builders (pump.fun now, PumpSwap/Jupiter after
     graduation).
  2. Run `verifyTradeTransaction`.
  3. Sign through the provider.
  4. Send with a priority fee, through an MEV-protected route where available.
- **Slippage:**
  - Default is **stop-limit**: the user sees the worst price they accept when creating the
    order ("trigger price minus 10% slippage minus fees").
  - If the market gaps past it, the order stays open and the user is told. It does not dump at
    any price.
  - Stop-market ("sell at any price") is a Pro option, with an explicit warning that it can
    fill much lower in a crash or a sandwich attack.
- **Retries:** on a failed send, rebuild with a fresh blockhash and the same limit, up to 3
  tries in 60 seconds, then mark the order "couldn't fill" and notify.
- **No double fills:** each order has an idempotency key and moves through states in
  Postgres: open, triggered, sending, filled or failed. A row lock means one worker owns an
  order at a time.
- **Graduation:** when a token leaves the bonding curve, open orders re-route to the new pool,
  with the same limits.
- **Order expiry:** every order has an expiry; the default is 30 days.
- **Honest limits, shown in the app:**
  - rugs, frozen tokens and liquidity pulls can make a stop impossible to fill;
  - a stop can fill lower in a sudden crash;
  - Sift doesn't promise any fill price beyond the limit the user set.

## 6. Migration of existing test users (devnet)

- Existing phone wallets **stay on the phone**. Seeds are never uploaded or imported, because
  that would move keys off the phone without a real need.
- On first launch after the update, each signed-in user gets a new Sift wallet. A one-time
  screen offers "Move your test SOL to your Sift wallet". The phone builds and signs that
  transfer itself, as today.
- **Profiles:** today an account _is_ a wallet. To keep the profile, followers and alerts,
  the old wallet signs a "link to my Sift wallet" message, and the profile moves to the new
  account.
- Phantom/MWA users keep Phantom connected and also get a Sift wallet for auto orders.
- The phone wallet stays in the app as "Phone wallet (manual trades)" for anyone who wants it.
  New users don't get one by default.

## 7. Threat model

| Threat                           | What could happen                                         | Protection                                                                                                                                                                                         |
| -------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sift's server is hacked          | Attacker signs trades from every wallet                   | Provider policy: only swaps, only to the fee wallet or saved address, caps. No token transfers. Freeze switch. Can't add addresses without the user's passkey.                                     |
| Stolen session token (GMGN 2025) | Attacker buys honeypots with victims' SOL                 | Device-signed requests, auto-buys never into red tokens, daily caps, new-device limits, alerts                                                                                                     |
| Malicious or careless insider    | Staff look up or front-run orders, or flip limits         | No staff tool shows a user's pending orders by default; every admin action logged; two-person rule for production secrets and the freeze switch; signer credential only in the host's secret store |
| Provider breach or outage        | Keys exposed, or signing down                             | Provider chosen for audited enclaves; if down, orders pause and the app says so; export and withdrawal also depend on it (stated honestly)                                                         |
| Price manipulation               | A crafted trade fires stops, then the attacker buys cheap | Robust median, 0.01 SOL minimum trade, 2 consecutive readings, circuit breaker                                                                                                                     |
| Sandwich bots                    | Triggered sells lose up to the slippage                   | Stop-limit by default, tight slippage, MEV-protected sending, priority fee                                                                                                                         |
| Rug or freeze                    | Stop can't fill                                           | Can't be prevented; shown clearly; red tokens flagged before buying                                                                                                                                |
| Phishing for the exported key    | User pastes key into a fake site                          | Export behind passkey + 2FA + warning; alert after every export                                                                                                                                    |
| Withdrawal-address takeover      | Attacker swaps in their address                           | Passkey at provider, 24-hour wait, push + email with a freeze link                                                                                                                                 |
| Bug in the order engine          | Mass or repeated sells                                    | Idempotency, state machine, rate limits, circuit breaker, verifier on the server, tests on devnet                                                                                                  |
| Server builds a bad transaction  | Funds sent somewhere wrong                                | The same `verifyTradeTransaction` used on phones, plus the provider policy                                                                                                                         |

## 8. Monthly cost (estimates, October 2026 prices)

| Item                             | Devnet testing (under 500 users) | 1,000 active users on mainnet                   |
| -------------------------------- | -------------------------------- | ----------------------------------------------- |
| Privy                            | $0                               | $299–$499                                       |
| Render: API always on (Starter)  | $7                               | $7–$25                                          |
| Render: order worker (always on) | $7                               | $7–$25                                          |
| Supabase                         | $0 (free)                        | $25 (Pro)                                       |
| Helius                           | Current free plan                | Paid plan likely needed (check current pricing) |
| **Total**                        | **about $14/month**              | **about $340–$575/month + Helius**              |

Turnkey instead of Privy at the same scale would be about $99 + $1,500/month. Users pay the
network and priority fees on their own trades, as today.

One-off costs, not monthly:

- an external security audit of the wallet, policies and order engine (needs a quote);
- legal advice and a custody licence application (needs a quote).

## 9. Regulatory and app-store points (not legal advice)

- **UAE (VARA):**
  - Law firms read the Custody Services Rulebook as covering anyone who "controls" or
    co-controls client assets. A server that signs users' trades clearly does.
  - Custody must sit in a separate licensed entity.
  - Executing users' orders may also be Broker-Dealer activity.
- **UAE federal law:** Federal Decree-Law No. 6 of 2025 may reach software that "facilitates"
  financial activity (penalties up to AED 1 billion, per commentators).
- **Apple 3.1.5(iii):** apps that facilitate crypto exchange need "appropriate licensing" in
  each country.
- **Google Play:** Google's exemption for non-custodial wallets **no longer applies** to Sift.
  Sift would need the licence in each country it ships to.
- **Before mainnet:** a UAE lawyer, the external audit and the licence. Until then everything
  stays on devnet, with test SOL only.

## 10. Rules that would change in CLAUDE.md (after approval)

Replace "Non-custodial only" with:

> **Custody only through the signing provider.** Sift wallets' keys live only in the signing
> provider (Privy). Sift never sees, stores or logs a private key or seed phrase. The server
> signs only through the provider, only transactions that pass `verifyTradeTransaction` and
> the provider policy, and never while the account or the whole platform is frozen. Phantom
> and phone-wallet trades are still signed on the device. Devnet only until the external audit
> and a custody licence.

## 11. Build plan once approved (devnet)

1. **Spike, 2 days:** prove the five rules (section 3.3) on Privy and Turnkey, then pick one.
2. **Wallet creation:** sign-up creates a Sift wallet, with passkey and TOTP set-up; the
   Wallet & security screen (`AutoWallet.dc.html`).
3. **Server signing:** manual trades from the Sift wallet, with full cost shown and both
   checks (the verifier on the server, then the provider policy).
4. **Withdrawals:** saved address, 24-hour wait, export, and the freeze switches.
5. **Order engine:** the worker, the order screens (`Order.dc.html`, `Orders.dc.html`) and
   "Protect this trade".
6. **Migration screen** for test users, then an internal security review of the whole flow.

Each step is tested and shown to you before the next one starts.

## 12. Questions for you

1. Privy (cheaper) or Turnkey (more expressive policies), if the spike shows both work?
2. Default caps on devnet: 1 SOL per order and 5 SOL a day?
3. 2FA: an authenticator app (TOTP), or passkey only? TOTP is stronger against phone theft,
   but adds a set-up step.
4. Keep the phone wallet for existing users, or retire it after migration?
