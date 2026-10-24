# On-chain / escrow-based limit, take-profit and stop-loss orders for Solana meme coins (state as of 2026-10-24)

Research method note: dev.jup.ag and docs.jup.ag failed DNS through WebFetch, so the Jupiter pages were fetched with curl from `developers.jup.ag` (developer docs, Mintlify `.md` exports) and `docs.jup.ag` (user docs) on 2026-10-24. Every "accessed" date below is 2026-10-24 unless stated. Jupiter's dev docs say the Trigger V2 API is in **beta** and may change.

## 1. Jupiter: product name, endpoints, custody model, execution, order types, fees, limits

### Takeaway

Jupiter's current product is **Trigger Order API V2** (UI name "Limit Order V2"), base `https://api.jup.ag/trigger/v2`. It does support stop-loss (sell below), OCO (TP+SL), OTOCO and, since July 2026, trailing stop-loss. But it is **not an on-chain program escrow**: the developer docs say deposits go to a per-wallet **"Vault account (custodial) by Privy"**, order state is off-chain in Jupiter's database, and Jupiter's keeper executes. The older on-chain PDA escrow (Trigger V1) is in maintenance and the jup.ag UI no longer creates V1 orders. For Sift, using V2 means funds held by a third party (Jupiter/Privy) during the order, which is a judgment call against Sift's "non-custodial only" rule. Integrator fees are not supported.

### Cited Findings

**Naming, versions, deprecation**

- Product: "Trigger Order API"; V2 "unifies two products that previously had separate APIs: limit orders (Trigger V1) and DCA (the Recurring V1 API)". Base URL `https://api.jup.ag/trigger/v2`; V1 used `/trigger/v1`. — [Jupiter dev docs: Trigger Order API Overview](https://developers.jup.ag/docs/trigger/index.md) (accessed 2026-10-24)
- Dev docs: "Trigger V1 is not scheduled for deprecation, but all development is focused on V2; V1 receives critical-only updates." — [Trigger overview](https://developers.jup.ag/docs/trigger/index.md); **contradicted by** user docs: "Limit Order V1 is being sunset. New V1 orders can no longer be created… Existing V1 orders can still be viewed and cancelled." — [Jupiter user docs: Limit Orders](https://docs.jup.ag/user-docs/trade/spot/limit-orders) (accessed 2026-10-24). (Possibly the UI stopped V1 creation while the API still accepts it; unconfirmed.)
- The Recurring API is "superseded by Trigger DCA orders… pages remain live but are… marked unmaintained" (July 2026). — [Jupiter Changelog July 2026](https://developers.jup.ag/changelog/2026-07)
- "The Trigger Order V2 API is in **beta** and under active development. Behaviour, endpoints, and response formats may change." — [Trigger Best Practices](https://developers.jup.ag/docs/trigger/best-practices.md)

**Custody / escrow model (key for Sift) — docs disagree**

- V1 vs V2 table: V1 deposits = "Program-derived address (PDA) order accounts", pending orders "visible on-chain (PDA accounts)"; V2 deposits = "Vault accounts (custodial) by Privy", "Orders stored off-chain, private until execution". — [Trigger overview](https://developers.jup.ag/docs/trigger/index.md)
- "Each wallet has one vault, a Privy-managed custodial account that holds deposits for all your orders." `GET /vault/register` returns `{ userPubkey, vaultPubkey, privyVaultId }`. — [Vault & Deposit](https://developers.jup.ag/docs/trigger/deposit.md)
- **Contradiction:** the user docs say "your selling tokens are moved into an intermediate vault (a secure program-owned account…)" and "the vault is program-owned, so there is no private key for it." — [User docs: Limit Orders](https://docs.jup.ag/user-docs/trade/spot/limit-orders). The developer docs explicitly say "custodial" and "Privy-managed"; the engineering blog says order state is off-chain. Treat V2 as a custodial (third-party-held) vault until Jupiter clarifies.
- Jupiter engineering blog (June 18, 2026): "In LOv1, the on-chain program was the state machine… with the token deposit wrapped into the order initialisation itself." In LOv2 "every detail of an order is off-chain. Order creation is still a transfer event on Solana – observers can see the deposit amount and the input token… the output token and the trigger price live in our database"; "For LOv2, the keeper IS the state machine"; a price order has "nineteen distinct states". Retry guarantees for withdrawals/executions are "best-effort rather than absolute". — [Jupiter blog: Limit Order v2: Correctness Under Failure (2026-06-18)](https://developers.jup.ag/blog/lov2-correctness-under-failure)

**Order creation flow and signing**

- Flow: (1) `POST /auth/challenge` + `POST /auth/verify` — sign a challenge message (or a transaction, for wallets that can't sign messages) to get a JWT; (2) `GET /vault` or `GET /vault/register`; (3) `POST /deposit/craft` returns an unsigned tx moving tokens wallet→vault (`orderType: "price"|"dca"`, `orderSubType: "single"|"oco"|"otoco"`); user signs it client-side; (4) `POST /orders/price` with `depositRequestId` + `depositSignedTx` — "The deposit lands on-chain during the create call"; returns `{ id, txSignature, depositConfirmed }`. — [Create Order](https://developers.jup.ag/docs/trigger/create-order.md); [Vault & Deposit](https://developers.jup.ag/docs/trigger/deposit.md)
- So the user signs: one auth message (per session), one deposit transaction per order, and one withdrawal transaction on cancel. Execution needs no user signature (keeper executes from the vault). — same sources; [Manage Orders](https://developers.jup.ag/docs/trigger/manage-orders.md)
- Auth: as of September 2026, `authMode: "access_refresh"` returns a 15-minute access token plus rotating refresh token, with `/auth/refresh`, `/auth/logout`, `/auth/logout-all`; the legacy `access_only` 24-hour JWT "was deprecated on 2026-07-21" but is still default when `authMode` is omitted. — [Jupiter Changelog September 2026](https://developers.jup.ag/changelog/2026-09)
- "Open orders continue to be monitored and will execute normally" after the JWT expires. — [Trigger overview FAQ](https://developers.jup.ag/docs/trigger/index.md)
- Orders can be edited in place: `PATCH /orders/price/{id}` (trigger price, slippage, TP/SL prices, `trailingBps`). — [Manage Orders](https://developers.jup.ag/docs/trigger/manage-orders.md)

**Cancellation / withdrawal**

- Two-step: `POST /orders/price/cancel/{id}` "immediately moves the order from `open` to `ready_to_cancel`. The order will no longer be filled" and returns an unsigned withdrawal tx; user signs and sends to `POST /orders/price/confirm-cancel/{id}`; retry allowed with same `cancelRequestId`. — [Manage Orders](https://developers.jup.ag/docs/trigger/manage-orders.md)
- UI: if the user rejects the wallet request after cancelling, the order sits in "Pending Withdraw" with tokens still in the vault. — [User docs: Limit Orders](https://docs.jup.ag/user-docs/trade/spot/limit-orders)

**Expiry — docs disagree**

- API: `expiresAt` (ms) is **required**; "There is no 'no expiry' option by design"; recommended max 30 days with renewal via update. — [Best Practices](https://developers.jup.ag/docs/trigger/best-practices.md)
- API: "If an order expires before execution, the funds remain in the vault. To retrieve them, use the same two-step cancel flow." — [Manage Orders](https://developers.jup.ag/docs/trigger/manage-orders.md); **contradicted by** user docs: "If the trigger condition is not reached before expiry, the order is cancelled automatically and the locked tokens are returned to your wallet." UI presets: 1 hour, 1 day, 1 week (default), 30 days, or custom. — [User docs: Limit Orders](https://docs.jup.ag/user-docs/trade/spot/limit-orders)

**Order types (stop-loss is supported in V2)**

- `single` (above/below a USD price; covers limit, stop-loss, trailing stop), `oco` (TP + SL sharing one deposit; TP price must be > SL price), `otoco` (entry, then OCO on the output). — [Create Order](https://developers.jup.ag/docs/trigger/create-order.md)
- V1 supported only "Buy below, sell above" on pool rate, no TP/SL; V2 "Buy above, buy below, sell above, sell below". — [Trigger overview](https://developers.jup.ag/docs/trigger/index.md)
- Trailing stop loss: `trailingBps` 50–9000 instead of `triggerPriceUsd`; keeper tracks a watermark; "Watermark updates are batched, not per price tick." Shipped in the API in July 2026. — [Create Order](https://developers.jup.ag/docs/trigger/create-order.md); [Changelog July 2026](https://developers.jup.ag/changelog/2026-07). UI trailing stop launched July 3, 2026 per press. — [Crypto Times (2026-07-04)](https://www.cryptotimes.io/2026/07/04/jupiter-launches-trailing-stop-loss-on-limit-orders/). "Trailing Take Profit is not supported"; trailing on a stablecoin trigger mint is refused. — [User docs](https://docs.jup.ag/user-docs/trade/spot/limit-orders)
- Triggers are USD price only (`triggerPriceUsd`); market-cap triggers are a frontend conversion (market cap ÷ total supply). — [Trigger overview FAQ](https://developers.jup.ag/docs/trigger/index.md)
- An old preview FAQ page says Trigger Orders "cannot be used as stop losses" — this describes V1 and is out of date. — [Jupiter preview FAQ (search snippet)](https://jupiter-space-station-pcz9x10rq.preview.jup.ag/guides/spot/trigger/faq)

**Price source, execution, slippage, MEV**

- Price source: an "in-house price stream that continuously derives USD prices for tokens from on-chain swap activity"; the trigger system subscribes to USD price events per trigger token. Caveat: "For the USD price of a token to exist in the stream, that token needs recent swap activity… Isolated clusters in that graph are invisible." V1 used the routing engine as a price feed with ~1s polling. — [Jupiter blog: The Any-Any Problem (2026-06-03)](https://developers.jup.ag/blog/lov2-the-any-any-problem)
- Execution: "a keeper… executes the trade through Jupiter Ultra"; "The exact output amount is not guaranteed". — [User docs](https://docs.jup.ag/user-docs/trade/spot/limit-orders). Partial fills are supported in V2. — [Trigger overview](https://developers.jup.ag/docs/trigger/index.md)
- Default slippage: TP / buy-below use auto (RTSE); **stop-loss / buy-above default 20% (2000 bps)**; settable 0–10000 bps. — [Create Order](https://developers.jup.ag/docs/trigger/create-order.md)
- "Stop Loss is not guaranteed to execute… especially common with low-liquidity tokens such as new memecoins or tokens that have been rugged." — [User docs](https://docs.jup.ag/user-docs/trade/spot/limit-orders)
- "The API does not validate whether your trigger price makes economic sense… the keeper will execute as instructed and the difference is lost." — [Best Practices](https://developers.jup.ag/docs/trigger/best-practices.md)
- MEV: orders private off-chain; Ultra routing "includes built-in MEV protection"; price checks before execution (if unfavourable, order stays active). — [User docs](https://docs.jup.ag/user-docs/trade/spot/limit-orders); [Trigger overview FAQ](https://developers.jup.ag/docs/trigger/index.md)

**Minimum size, fees, integrator fees**

- Minimum 10 USD per price order (rejected at deposit craft: `400 "Order must be at least 10 USD…"`). — [Vault & Deposit](https://developers.jup.ag/docs/trigger/deposit.md); [Create Order](https://developers.jup.ag/docs/trigger/create-order.md)
- Fees (V2): base 0.03% (stable/pegged pairs), 0.1% (others) + Ultra routing fee 0–0.5%, deducted at execution. V1: flat 0.1%. — [User docs](https://docs.jup.ag/user-docs/trade/spot/limit-orders)
- "Does Trigger V2 support integrator fees? Not currently, and there is no timeline… There is no atomic workaround because the keeper executes the transaction… The only option is to run a separate transfer transaction outside the order flow." — [Trigger overview FAQ](https://developers.jup.ag/docs/trigger/index.md)

**API key, rate limits, devnet**

- All Trigger endpoints need `x-api-key`; authenticated ones also need `Authorization: Bearer`. — [Trigger overview](https://developers.jup.ag/docs/trigger/index.md)
- Rate limits (60 s sliding window, per organisation): Keyless 0.5 RPS, Free 1 RPS, Developer 10, Launch 50, Pro 150. — [Jupiter Rate Limits](https://developers.jup.ag/docs/portal/rate-limits.md) (fetched via llms.txt index; exact path inferred from index)
- Devnet: I found no mention of devnet support anywhere in the Jupiter developer docs index ([llms.txt](https://developers.jup.ag/docs/llms.txt)); all examples use mainnet mints (SOL, USDC) and Solscan mainnet links. See Gaps.

### Inferences

- Jupiter V2 gives Sift everything functionally (SL, TP, OCO, trailing, USD triggers, keeper execution, no user online at trigger) but the user's tokens leave their wallet into a Privy-managed vault Jupiter controls. Sift itself would still never hold keys, but the user's assets are custodied by a third party while orders are open; Sift should disclose this plainly (and the docs' own contradiction about "program-owned" vs "custodial") rather than call it non-custodial.
- Because there is no integrator fee, Sift's platform fee on these orders would need a separate transfer tx at deposit time (signed by the user), which `verifyTradeTransaction` would need to understand; the deposit tx itself goes to a Jupiter vault address that the phone cannot verify against a fixed program allow-list (it is a per-user Privy account), so the allow-list would have to trust `vaultPubkey` from Jupiter's API.
- 20% default SL slippage on meme coins means users may get far less than the trigger; Sift's "show full cost" rule implies showing the worst-case fill (trigger × (1 − slippage) − fees).
- Can't be tested on devnet; Step-8 mainnet gating applies.

### Gaps

- Whether the Privy vault is an MPC/TEE wallet with user-recoverable keys, and what happens to funds if Jupiter's service goes down (no doc found).
- Whether `/trigger/v1` still accepts new orders via API (dev docs vs user docs disagree).
- Official devnet support statement (none found).
- Exact Trigger endpoint rate-limit bucket (rate-limit page lists a separate bucket only for `/swap/v2/execute`).

## 2. Token coverage: pump.fun bonding curve, graduated tokens, Token-2022

### Takeaway

Jupiter's Metis router lists **Pump.fun (bonding curve)** and **Pump.fun AMM (PumpSwap)**, plus Raydium/Meteora venues, under "instant routing", and Trigger V2 accepts "any token to any other token" once a route and a USD price exist, so pre- and post-graduation pump.fun tokens should be eligible in principle. Caveats: bonding-curve markets drop out of routing if the token doesn't graduate within the grace period; USD price needs recent swap activity; Token-2022 transfer-fee/hook mints are rejected by the API unless whitelisted (user docs say transfer-fee tokens are supported — contradiction).

### Cited Findings

- Instant-routing DEXes include "Meteora Dynamic Bonding Curve, Meteora Dynamic AMM, Meteora DAMM V2, Meteora DLMM, Raydium, Raydium CLMM, Raydium CPMM, Raydium Launchlab, Pump.fun AMM, Pump.fun, …". "For bonding curves: if the token does not graduate before the grace period ends, the market is removed from routing. Once the bonding curve graduates to a new market, the graduated market is added to routing." Grace period is by token age (example table: 20 days within, 30 days outside). After that, a market must pass a $500 round-trip <30% or $1000-vs-$500 <20% price-impact check, re-checked every 30 minutes. — [Jupiter: Market Listing](https://developers.jup.ag/docs/swap/routing/amm/market-listing.md)
- `/swap/v2/order` may return a quote via other routers (JupiterZ, OKX, DFlow) when Metis has no route. — same source
- "On Jupiter, you can open a limit order on any pair… It executes as soon as two conditions hold: a route exists between the two tokens, and your price condition is met." — [Jupiter blog: The Any-Any Problem (2026-06-03)](https://developers.jup.ag/blog/lov2-the-any-any-problem)
- Token-2022 (API): "Tokens with transfer-fee or transfer-hook extensions are rejected at deposit unless whitelisted." — [Best Practices](https://developers.jup.ag/docs/trigger/best-practices.md); [Vault & Deposit](https://developers.jup.ag/docs/trigger/deposit.md). **Contradicted by** user docs: "Limit Order V2 supports Token-2022… tokens, including those that charge a transfer fee"; only an OTOCO whose buy token charges a transfer fee is refused. — [User docs](https://docs.jup.ag/user-docs/trade/spot/limit-orders). (Possibly jup.ag is whitelisted or whitelists specific mints.)
- V1 did not support Token-2022 with transfer tax. — [User docs](https://docs.jup.ag/user-docs/trade/spot/limit-orders)
- After a swap, jup.ag suggests "Trailing stop loss at 20%" when market cap is below $10 million, and shows no suggestion when the token "cannot be used in Limit V2 orders". — [User docs](https://docs.jup.ag/user-docs/trade/spot/limit-orders)
- pump.fun now has `buy_v2/sell_v2` (mandatory accounts incl. `user_volume_accumulator`, `sharing_config`, quote-mint accounts) and newer `buy_v3/sell_v3` (17 accounts), PumpSwap `buy_v2/sell_v2`, and `multi_hop_swap`; USDC/pump-coin quote mints are being added ("Trading USDC-paired coins will not be possible with the legacy instructions"). — [pump-fun/pump-public-docs README](https://github.com/pump-fun/pump-public-docs) (accessed 2026-10-24)

### Inferences

- A trigger order on a pump.fun coin that graduates mid-order should keep working with Jupiter because execution re-routes at fill time (Ultra), unlike a pre-signed bonding-curve tx.
- Very new or thinly traded coins may have no USD price in Jupiter's stream, so a stop could fail to fire; Sift should show "may not trigger" for such tokens (fits the "missing data is amber" rule).

### Gaps

- No Jupiter doc explicitly says "trigger orders work on pump.fun bonding-curve tokens"; this is inferred from routing + any-any statements. Should be confirmed by testing on mainnet with a small amount.
- Exact length of the instant-routing grace period isn't stated as a number (only the example table).

## 3. Other on-chain order venues usable by a third-party app

### Takeaway

None of the alternatives gives on-chain stop-loss for pump.fun meme coins in spot. Meteora DLMM now has native **on-chain limit orders** (resting single-sided bins; true program escrow, no keeper) but only on limit-order-enabled DLMM pools and only for orders on the "resting" side (TP above / buy-dip below) — no stop-loss. Drift's docs (now branded "Velocity Protocol") are perp-only. Phoenix/OpenBook are CLOBs with little meme-coin coverage. DFlow's escrow is for intent swaps, not triggers. Clockwork was shut down in 2023; Helium's Tuk Tuk is a time/task crank, not a price oracle.

### Cited Findings

- **Meteora DLMM Limit Order:** "place liquidity at specific bins so their position behaves like a buy or sell order"; "available only on DLMM pools whose function mode supports limit orders… a pool supports either liquidity mining or limit-order behavior"; one order account covers up to 50 bins; bid side = token Y at/below active bin, ask side = token X at/above active bin; "If the market never reaches that bin, the order remains open until the user cancels it"; "It is an on-chain DLMM account"; "not guaranteed execution"; 50% of the limit-order portion of fees goes to limit-order participants. — [Meteora docs: DLMM Limit Order](https://docs.meteora.ag/core-products/dlmm/limit-order) (accessed 2026-10-24)
- **Drift / Velocity:** the page at docs.drift.trade is titled "Velocity Protocol" and says "Everything here is about perpetual futures; spot order placement is rejected onchain." Trigger orders (trigger market / trigger limit) are the basis for SL/TP. — [docs.drift.trade advanced order types](https://docs.drift.trade/protocol/trading/order-types/advanced-order-types) (accessed 2026-10-24). Older Drift material described spot stop orders and keeper "trigger bots" — [Drift order trigger bot tutorial](https://docs.drift.trade/tutorial-bots/keeper-bots/tutorial-order-trigger-bot); [Drift learn: order types](https://www.drift.trade/learn/order-types) (undated; likely superseded).
- **Phoenix:** fully on-chain CLOB with "instant atomic settlement… without asynchronous cranking"; OpenBook is a community fork of Serum rated "Unhealthy" by a third-party tracker (Sept 2026). — [MadeOnSol: OpenBook vs Phoenix](https://madeonsol.com/compare/openbook-vs-phoenix) (aggregator, low confidence); [Solana Compass: Phoenix](https://solanacompass.com/projects/phoenix)
- **DFlow:** "declarative swaps" — sign an open-order tx with a guaranteed minimum output; source token sits in an escrow program until an aggregator fills; open + fill run as a Jito bundle; Token-2022 not supported on `/intent`. No limit/trigger orders found. — [DFlow docs: Declarative swaps](https://pond.dflow.net/concepts/declarative-swaps) (via search summary). DFlow acquired by MoonPay in May 2026 per one aggregator — [thegrid.id: DFlow](https://thegrid.id/profiles/dflow) (single unverified source)
- **Clockwork:** team announced in August 2023 it would stop supporting the platform; guide kept "for historical reference", points to Tuktuk. — [QuickNode: Automation with Clockwork (legacy)](https://www.quicknode.com/guides/solana-development/legacy/automation-with-clockwork)
- **Tuk Tuk (Helium):** "a permissionless crank service. If you have a Solana smart contract endpoint that needs to be run on a trigger or specific time"; endpoints must be "more or less permissionless, though you can have tuktuk provide PDA signatures"; crankers paid in SOL per crank; 1 SOL refundable deposit per task queue; supports "remote transactions" and cron tasks. — [helium/tuktuk README](https://github.com/helium/tuktuk) (accessed 2026-10-24); introduced at Accelerate 2025 — [Solana Compass](https://solanacompass.com/learn/accelerate-25/scale-or-die-at-accelerate-2025-tuk-tuk-on-chain-cron-jobs)

### Inferences

- DLMM limit orders could serve take-profit only for tokens that have a limit-order-mode DLMM pool; pump.fun coins graduate to PumpSwap, so coverage would be rare.
- Tuk Tuk could crank a Sift escrow program, but the price-condition check must live in Sift's program (with an on-chain price read, e.g. pool reserves), and pool-reserve prices are manipulable within a tx.

### Gaps

- Switchboard automation/"functions" current status not researched (tool budget).
- Phoenix meme-coin market coverage: no primary data found.
- Whether Drift still exists separately from "Velocity" (rebrand vs replacement) is unclear.

## 4. Self-built non-custodial designs

### Takeaway

(a) Durable-nonce pre-signed sells are truly non-custodial and cancellable, but brittle for pump.fun (account sets and instruction versions change; graduation moves the market) and give only "sell at ≥ minOut" — a gap down below minOut means no fill, and whoever holds the signed tx can submit it at any time. (b) SPL `Approve` lets a keeper move up to the delegated amount anywhere, which is equivalent to custody of that amount. (c) A Sift escrow program is the cleanest on-chain design (like Jupiter V1) but carries full audit/upgrade-authority burden.

### Cited Findings

- Blockhashes are valid ~150 blocks (~80–90 s); with a durable nonce in place of a recent blockhash, "the first instruction of the transaction needs to be a `nonceAdvance` instruction"; the nonce authority "has the authority to generate a new nonce, advance the nonce or withdraw SOL from the Nonce Account"; creating one costs ~0.0015 SOL rent. — [Solana: Introduction to Durable Nonces](https://solana.com/developers/guides/advanced/introduction-to-durable-nonces)
- SPL Token: "Account owners may delegate authority over some or all of their token balance using the Approve instruction. Delegated authorities may transfer or burn up to the amount they've been delegated… may be revoked by the Account's owner via the Revoke instruction." — [Solana Program Library: Token](https://www.solana-program.com/docs/token)
- pump.fun: `buy_v2/sell_v2` require both a `feeRecipient` (8 normal, 8 reserved for "mayhem mode" coins) and a `buybackFeeRecipient`; `user_volume_accumulator` and `sharing_config` are mandatory; v3 trades keep fees on the curve; "All existing trade instructions keep working". — [pump-public-docs README](https://github.com/pump-fun/pump-public-docs); [FEE_RECIPIENTS.md](https://github.com/pump-fun/pump-public-docs/blob/main/docs/FEE_RECIPIENTS.md)
- Jupiter itself moved away from the on-chain escrow model for privacy: in V1 "every open order was fully visible on the public ledger… MEV bots can front-run triggers." — [Jupiter blog (2026-06-18)](https://developers.jup.ag/blog/lov2-correctness-under-failure)

### Inferences (design analysis, not sourced facts)

- **(a) Pre-signed durable-nonce sells.** One nonce account per order (user is nonce authority). The phone signs `[nonceAdvance, (Sift fee), sell(amount, minOut)]` up front; Sift's keeper submits when the trigger hits. Cancel = user signs a tx advancing the nonce (invalidates the stored tx). Problems:
  - minOut is fixed at signing. If price gaps below minOut (common on rugs), the tx fails and the stop simply doesn't execute; a ladder of pre-signed txs at lower minOuts trades protection for worse fills.
  - Anyone holding the signed tx (Sift keeper, or an attacker who steals it) can submit it at any time, not only at trigger; for a stop-loss minOut is below market, so early submission sells the position at market. Protection is only minOut, not the trigger.
  - The tx pins exact accounts: pump.fun fee recipients, creator vault, instruction version, and the bonding curve itself. After graduation the bonding-curve sell would fail (curve complete), and a PumpSwap sell needs a different tx; any pump.fun account-layout change invalidates stored txs. A design would need to pre-sign both venues or re-sign after migration.
  - Pre-signing a Jupiter route is worse: routes and ALTs go stale.
  - Sift's `verifyTradeTransaction` must check the nonce-advance first instruction and that the nonce authority is the user.
- **(b) Delegate approval.** A delegate can transfer the approved amount to any address, so a compromised Sift keeper could drain it. This is custodial in effect and conflicts with Sift's non-negotiables; it also doesn't let a keeper sign as the user for a swap's other accounts.
- **(c) Sift escrow program.** User deposits into a PDA owned by Sift's program with on-chain trigger params and minOut; keepers (Sift or Tuk Tuk) call an execute instruction that CPIs into pump.fun / PumpSwap / Jupiter and enforces minOut and a price check. Non-custodial if the program is immutable or upgrade authority is multisig/timelocked; but it needs a professional audit, ongoing maintenance as pump.fun interfaces change, a trustworthy on-chain price check (spot pool price is manipulable in-tx, so oracle or TWAP needed), and orders are publicly visible (the MEV issue Jupiter cited).

### Gaps

- No primary source found on pump.fun's exact error when selling on a completed bonding curve (inferred).
- No audit cost quotes researched.
