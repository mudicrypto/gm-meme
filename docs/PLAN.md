# Sift — Safer Meme Trading App: Concept & Build Plan

> Instructions for Claude Code: read this whole file first. Build Sift one step at a time, following "Build steps" below. Stop after each step so I can test it, and commit to git after each working step. Use Solana devnet until the security review (Step 8) is done.

## Concept

Sift is a mobile-first meme coin trading app that puts safety and social discovery first, where GMGN puts raw speed first. "Sift" is a working name; check trademarks and domains before using it.

**One-line pitch:** Trade new Solana tokens with your friends, with every token pre-checked for scams and explained in plain language.

**Who it's for:**

- Newer retail traders who find GMGN and Axiom intimidating
- Social traders who follow friends and KOLs rather than raw charts
- iPhone users, since GMGN's mobile app is Android only

**Why it can win:** Power traders are well served. The gap is the much larger crowd that wants in but keeps getting rugged. FOMO's rise in 2026 shows social-first trading can beat pure terminals on revenue.

## What's better than GMGN

Three differentiators carry the product; the rest are table stakes.

| Area | GMGN today | Sift |
| --- | --- | --- |
| Safety | Rug warnings, mostly for experts | Traffic-light risk score on every token, with reasons |
| Explanations | Raw data and charts | AI summary: why it's moving, who's buying, red flags |
| Social | Copy-trade wallets | Friends feed, shared watchlists, group chats per token |
| Ease of use | Dense pro terminal | Simple mode by default, Pro mode toggle |
| Mobile | Android app only | iOS and Android from day one |
| Fees | Shown per trade, hard to compare | Full cost before you confirm: fee, priority fee, slippage |
| Reporting | Basic P&L | Profit and loss plus tax export |

**The core three:** risk score, AI explanations, and the social feed. Everything else supports them.

## MVP scope

The MVP is a Solana-only mobile app that discovers, scores and trades new tokens, plus a simple friends feed. Everything else waits.

**In the MVP:**

1. Token discovery feed: new launches and trending tokens on Solana
2. Risk score per token: dev wallet history, holder concentration, mint and freeze authority, liquidity lock, honeypot test
3. AI token summary in plain language
4. Buy and sell via a swap aggregator (Jupiter), with full cost shown before confirming
5. Non-custodial wallet: connect Phantom or create an embedded wallet
6. Watchlist and price alerts
7. Friends feed: follow people, see their trades if they opt in

**Later:**

- Copy trading and auto-trading bots
- More chains (Base, BNB, Ethereum)
- Telegram bot and Chrome extension
- Tax export, KOL leaderboards, referral program

**Not building:** sniping bots that front-run other users, and MEV sandwich strategies. They harm your own users and invite regulators.

## Tech architecture

A React Native app talks to one API server, which pulls data from four external services. Trades are signed on the user's phone, so Sift never holds private keys.

```
Mobile app (Expo, iOS + Android) --signs--> User's wallet (Phantom / embedded; keys never leave the phone)
        |
     API calls
        v
API server (Node.js + Fastify)
  - Discovery        (new and trending tokens)
  - Risk score       (green / amber / red, with reasons)  <- core of the product
  - AI summary       (plain-language token explainer)
  - Social and swaps (follows, feed, alerts, swap quotes)
        |
        v
External services: Helius (Solana data) | Supabase (Postgres) | Claude API (summaries) | Jupiter (swap routing)
```

The risk score is the core of the product, so it lives in our own code; everything else uses ready-made services to ship fast.

| Layer | Choice | Why |
| --- | --- | --- |
| Mobile app | Expo (React Native, TypeScript) | One codebase for iOS and Android |
| API | Node.js + Fastify | Fast, simple, same language as the app |
| Database | Supabase (Postgres) | Auth, database and realtime feed in one |
| Solana data | Helius | Token launches, holders, webhooks |
| Swaps | Jupiter API | Best-price routing across Solana DEXs |
| AI | Claude API | Plain-language token summaries |

## Build steps

Build in small steps: one step per feature, test it, commit, then move on.

**Before starting:** free accounts are needed for Helius (Solana data), Supabase (database) and Expo (mobile builds). Keep all API keys in a `.env` file that is never committed.

### Step 1 — project setup

Create a CLAUDE.md for a project called Sift: a mobile-first Solana meme coin trading app focused on safety and social discovery. Stack: Expo (React Native, TypeScript) app, Node.js + Fastify API, Supabase Postgres, Helius for Solana data, Jupiter for swaps. Non-custodial only: we never hold private keys. Set up a monorepo with apps/mobile, apps/api and packages/shared. Add lint, tests and a README.

### Step 2 — token discovery

In apps/api, build a service that listens for new Solana token launches and trending tokens using Helius, stores them in Supabase, and exposes GET /tokens/new and GET /tokens/trending. Add tests with mocked Helius responses.

### Step 3 — risk score

Add a risk scoring module. For each token check: mint authority revoked, freeze authority revoked, top 10 holders' share, liquidity locked or burned, dev wallet's past launches, and a simulated sell (honeypot check). Return a score of green, amber or red plus a list of reasons. Expose GET /tokens/:mint/risk. Write unit tests for each check.

### Step 4 — AI summary

Add GET /tokens/:mint/summary that sends the token's risk checks, price action and holder data to the Claude API and returns a 3-sentence plain-language summary with red flags. Cache results for 5 minutes. Never present it as financial advice.

### Step 5 — mobile app screens

In apps/mobile, build three screens with Expo Router: Discover (new and trending tokens with risk badges), Token detail (chart, risk reasons, AI summary, buy and sell buttons), and Portfolio. Use a clean, simple design with a Simple and Pro mode toggle.

### Step 6 — wallet and trading

Add wallet connection (Phantom via Solana Mobile Wallet Adapter, plus an embedded wallet option). Implement buy and sell through the Jupiter swap API. Before confirming, show the full cost: platform fee, priority fee, expected slippage and minimum received. Test on Solana devnet first.

### Step 7 — social feed

Add user profiles, follow and unfollow, and a friends feed showing trades from people who opted in to share. Add a watchlist and push notifications for price alerts.

### Step 8 — security review

Review the whole codebase for security issues: key handling, API auth, rate limiting, input validation, and transaction signing. List findings by severity and fix the critical ones.

## Risks

- **Licensing:** crypto trading apps need licenses in many countries. In the UAE that likely means VARA; check before launch with a local lawyer.
- **App stores:** Apple and Google have strict crypto app rules. Read them before designing the trading flow.
- **Security:** wallet and signing bugs lose real money. Get an external audit before mainnet.
- **User losses:** most meme coins go to zero. Clear risk warnings protect users and the brand.
- **Competition:** GMGN, Axiom, BullX, Photon and FOMO are well funded. Safety plus social is the angle; don't compete on speed.
