# GMGN-style limit / TP / SL / trailing orders: how GMGN and peers implement them (as of 2026-10-24)

Research date: 2026-10-24. Doc page dates are GitBook "last updated" timestamps read from each page's HTML on 2026-10-24. gmgn.ai itself (incl. its blog) returned a Cloudflare block to our fetcher, so the GMGN blog post on TP/SL was seen only as a search snippet. Primary sources are GMGN's GitBook docs (docs.gmgn.ai), Axiom's GitBook docs, Turnkey's case study and Jupiter's docs. Everything else is marked as secondary.

## 1. GMGN order types and UX (limit, TP/SL, trailing, auto-sell, migration snipe, copy trade, fees, priority/anti-MEV)

### Takeaway
GMGN offers limit buy ("Buy Dip"), limit sell (fixed amount or % of holdings), several preset TP/SL levels attached to a buy, trailing take-profit, trailing stop-loss, migrated (graduation) snipe/sell, dev-sell triggers and copy trading. Triggers are a price or a % change from the entry price, with expiry options of 1h, 24h or 3 days in the bot (auto-sell TP/SL orders last 24h). Once triggered, every order is just a market swap at the user's slippage, so no fill price is guaranteed. The fee is a flat 1% per trade, and the docs recommend at least 0.006 SOL priority/tip for limit orders.

### Cited Findings
**Order types and where they live**
- The Orders tab on the web token page covers "Limit, Auto Trading, Migrated Snipe, Sell on Dev Sell, Buy on Dev Sell and Advanced strategies". In the app, orders sit under Assets. — [GMGN docs: HOLDING](https://docs.gmgn.ai/index/holding) (search snippet, 2026-10-24)
- The Holding page shows each limit order's quantity, trigger price, creation time and status (successful/cancelled/expired). — [GMGN docs: HOLDING](https://docs.gmgn.ai/index/holding)

**Limit buy ("Buy Dip")** (page last updated 2024-08-18, older info)
- On web, a user must "click to bind TG bot wallet" before they can place a Buy Dip limit order. They then set quantity, slippage and anti-MEV. — [GMGN docs: Auto Buy & Limit buy](https://docs.gmgn.ai/index/auto-buy-auto-buy-limit-buy)
- In the Telegram bot, you "Set the trigger price (support input price, or positive or negative percentage), and check the validity period of the Limit Buy order (support 3 days /24 hours /1 hour)". — same page
- Bot auto-buy filters: Min Liq (e.g. buy only if pool > $1K) and Max MC (e.g. only if market cap < $250K). — same page

**Limit sell and multiple TP/SL** (page last updated 2025-08-19)
- "GMGN supports presetting multiple take-profit, stop-loss limit orders when buying by GMGN TG wallet". Take-profit price = current price + current price × TP%. Stop-loss price = current price − current price × SL%. On web you add or delete rules with [+add] under "Advanced Trading Strategy". — [GMGN docs: Auto Sell & TP/SL](https://docs.gmgn.ai/index/auto-sell-auto-sell-take-profit-stop-loss)
- Bot auto-sell: stop-loss is a negative % (e.g. −50%) and take-profit a positive % (e.g. +50%), each with a sell % of the bought amount. "The total T/P sell amount percentage should add up to 100%." The bot "can automatically create take profit/stop loss limit sell orders with a validity period of 24 hours". — same page
- Web limit sell can be a fixed amount or a % of holdings ("no need for multiple limit orders after adding positions"). The order price line appears on the candle chart and can be dragged. — same page
- Telegram limit sell uses a trigger price or ±% and has a validity of 3 days, 24 hours or 1 hour. — same page
- Caveat: "Auto sell is calculated separately for each purchase... not... according to the current total position". With several buys, each buy triggers its own TP/SL set. — same page
- Quick-buy auto trading: on web you "Connect Telegram" and set an amount plus TP and/or SL ("at least one value must be filled in"). Orders appear in a "Strategy Order" list. — [GMGN docs: Auto Trading: Quick Buy & TP/SL](https://docs.gmgn.ai/index/auto-trading-quick-buy-take-profit-stop-loss) (last updated 2025-01-25)
- Snippet from GMGN's own blog: "On GMGN both are limit orders that fill at your slippage once triggered — neither can lock the price 100%." — [GMGN Blog: How to Set TP, SL, Trailing Stop, Trailing TP](https://gmgn.ai/blog/how-to-set-take-profit-stop-loss-on-gmgn/) (seen only via search snippet; page blocked by Cloudflare; date unknown)

**Trailing orders**
- Trailing stop-loss: the "stop loss price will increase as the token price rises". Stop = highest price × (1 − drawdown%). It "will only keep rising and cannot be lowered". "There is no activation price for trailing stop loss. When an order is created, the trailing stop loss will start immediately." — [GMGN docs: Trailing Stop Loss](https://docs.gmgn.ai/index/trailing-stop-loss) (last updated 2024-10-25, older info)
- Trailing take-profit: it activates when price hits the TP price, then sells when price falls back by the set drawdown % from the high. The docs give example pairings: TP +50% with 10% drawdown, +100% with 15%, +200% with 20%. — [GMGN docs: Trailing Take Profit](https://docs.gmgn.ai/index/trailing-take-profit)
- UI: the Auto panel switches to "TTP". Trigger price = buy price × (1 + TP%). A grey dot means pending and a green dot means activated, showing the highest price and current stop. — [GMGN docs: Quick Buy & TP/SL](https://docs.gmgn.ai/index/auto-trading-quick-buy-take-profit-stop-loss)

**Migration (graduation) snipe**
- "All SOL chain ungraduated tokens can set up Migrated Snipe". It auto-buys "when DEX adds official LP", with optional TP/trailing TP, SL/trailing SL, slippage, priority fee and anti-MEV. There is one task per token, and none can be created after LP is added. — [GMGN docs: Migrated Snipe](https://docs.gmgn.ai/index/auto-trading-migrated-snipe) (last updated 2025-09-02)
- The docs also have Migrated Sell and Dev Sell pages (sell or buy when the developer sells). — [GMGN docs index](https://docs.gmgn.ai/index/auto-trading-dev-sell)

**Copy trading** (page last updated 2026-01-08)
- "One copytrade transaction = buying/selling amount + Gas priority fee + 1% GMGN handling fee". Filters include min/max market cap, minimum liquidity, token age, pool-burnt ratio, minimum copy amount, and platform (e.g. Pump only, or PumpFun + Raydium). Failed copies are retried 1–3 times depending on the error. — [GMGN docs: Copy Trade](https://docs.gmgn.ai/index/copy-trade-copy-smart-money-automatically-earn-sol)

**Fees, priority fees, anti-MEV, minimums** (page last updated 2025-08-18)
- "GMGN only charges a 1% handling fee for a single transaction". Pump.fun's own 1% platform fee comes on top for pump.fun tokens. — [GMGN docs: Fees & Settings](https://docs.gmgn.ai/index/gmgn-fees-settings)
- Recommended slippage for "automatic buy/sell and other pending order operations is 30%-35%; for new and popular tokens... 50% or more". — same page
- Priority fee minimum 0.0001 SOL and tip minimum 0.0001 SOL, with a 2 SOL maximum. Anti-MEV needs a priority fee of at least 0.002 SOL. There are three RPC submission modes: Off (all nodes), Reduced (limited nodes, "may be front-run") and Secure ("safe nodes, slightly slower, with compensation"). Custom RPC is used as a backup. "For auto buy/sell limit order placement, a fee of 0.006 SOL or higher is recommended." — same page
- Failure page: keep at least 0.05 SOL in the wallet for triggered orders. Price "pins" (wicks) may look like a hit but not trigger (J1). A triggered order can fail on slippage and still burn the fee (K1). — [GMGN docs: Transaction/Limit Order failure](https://docs.gmgn.ai/index/transaction-limit-order-failure) (last updated 2025-08-28)

### Inferences
- GMGN's "limit orders" are really server-held conditional market orders: watch a price, then fire a swap. There is no resting on-chain order. That fits the slippage guidance, the "pin cannot be triggered" note, and the fees burned on failed triggered swaps.
- For Sift's "show full cost" rule: GMGN's model can't show a guaranteed minimum received at order creation. Only the slippage bound applies at trigger time.

### Gaps
- I could not read the GMGN blog post (Cloudflare block), so whether triggers can be set by market cap (versus price/% only) is unconfirmed for GMGN's order UI. The docs show market-cap filters only for auto-buy and copy-trade.
- The docs do not document the maximum number of TP/SL levels, or the expiry options in the current web/app UI. The expiry figures above come from bot pages last updated in 2024–2025.
- No GMGN documentation names the price source for triggers. It is presumably GMGN's own indexer, but that is undocumented.
- The 2025-08 fee page is the latest I found. Fee changes since then are unknown.

## 2. GMGN wallet model (who holds keys, export, deposits vs Phantom, custodial?)

### Takeaway
GMGN's own docs call the wallet "custodial". GMGN generates the trading wallets (through Telegram login, or a "custodial wallet account" created when you log in with Phantom), and private keys cannot be exported. Users deposit into these wallets and withdraw through 2FA and a whitelist. Orders and automation need these GMGN-held wallets: trading with a browser-extension wallet "doesn't support these features". The docs do not mention Turnkey, Privy or a TEE.

### Cited Findings
- "Connect Telegram, Connect Phantom, App Scan Code Login allows you to use Anti-MEV and various GMGN automation functions. Trade with plugin wallet doesn't support these features." — [GMGN docs: TG Wallet: Connect TG, Multi-Wallet system](https://docs.gmgn.ai/index/tg-wallet-connect-tg-multi-wallet-system) (last updated 2025-05-17)
- Phantom login: "Support Phantom Wallet for Login, Custodial Account Creation, and Transactions... GMGN will create a multi-chain custodial wallet account based on your Phantom wallet... New wallet addresses are generated for each chain." The same page calls it an "escrow account". — same page
- "For the safety of user wallet funds, GMGN all chains (SOL chain / EVM chain / Tron chain) are prohibited from exporting private keys". — same page
- "The first time you use the GMGN TG bots, it will automatically generate the SOL chain, EVM chain... and Tron chain wallet addresses". Export is prohibited on all chains, and "Wallets imported from outside also can't export private keys". Users can import a key into GMGN. — [GMGN docs: TG Wallet: Import & Export private key, Deposit, Withdraw](https://docs.gmgn.ai/index/tg-wallet-import-export-private-key-deposit-withdraw) (last updated 2026-01-08)
- Funding means depositing SOL to the GMGN wallet address. Withdrawals are web-only and need Google Authenticator 2FA plus a whitelisted address, with a 3-hour hold after first setting or changing the whitelist and a 24-hour hold after re-binding 2FA. — same page
- Multi-wallet: up to 10 created and 10 imported SOL wallets. Archiving a wallet closes "all open orders, wallet copiers, CTO copier automated strategies". — [GMGN docs: Multi-Wallet system](https://docs.gmgn.ai/index/tg-wallet-connect-tg-multi-wallet-system)
- The Agent/trading API "Adopts the GMGN hosted wallet architecture where private keys are not stored locally". — [GMGN docs: GMGN Agent API](https://docs.gmgn.ai/index/gmgn-agent-api) (last updated 2026-05-27)
- GMGN's bug bounty treats as critical "unauthorized access to GMGN wallets, funds, or private keys". Reports go through HackenProof. — [GMGN docs: Vulnerability Bounty Program](https://docs.gmgn.ai/index/gmgn-vulnerability-bounty-program)
- Secondary: a review lists non-exportable private keys for GMGN-generated wallets as a main risk. — [Datawallet: GMGN erklärt](https://www.datawallet.com/de/krypto/gmgn-explained) (search snippet, date unknown)

**Security incidents (secondary)**
- 2025-10-28: SlowMist's Yuxian (Cosine) reported that GMGN users' "private keys were not leaked". Their SOL/BNB was spent buying "Pixiu" (buy-only honeypot) tokens, with losses over $700K. He suspected phishing sites stole GMGN account login tokens. "GMGN has already fixed the issue." — [Odaily, 2025-10-28](https://www.odaily.news/en/newsflash/454353); [Phemex News, 2025-10-28](https://phemex.com/news/article/gmgn-users-targeted-in-700000-phishing-scheme-exploiting-pi-xiu-pools-30761)
- Secondary, not opened: GMGN co-founder Haze reportedly said about 107 users were affected by a forged-site phishing incident and would be reimbursed to their GMGN accounts. A separate MEV attack reportedly hit 729 transactions, also compensated. — [MEXC News (relaying PANews)](https://www.mexc.com/news/143296) (late Oct 2025; seen as a search summary only)
- 2026-03-21: lookalike drainer domain gmgn-wallet.com was registered. This was impersonation, not a GMGN breach. — [PhishDestroy](https://phishdestroy.io/domain/gmgn-wallet.com/llm.txt)

### Inferences
- The Pixiu incident shows the risk of GMGN's model. Whoever holds a GMGN session token can make GMGN's servers sign trades from the user's wallet, with no key theft needed. That fits a design where GMGN's backend holds or controls signing keys.
- GMGN's model directly breaks Sift's non-negotiables: the provider generates the keys, they cannot be exported, the docs call it custodial, and the server signs.

### Gaps
- GMGN does not document where keys are stored (HSM, KMS, TEE, MPC or a vendor). I found no Turnkey or Privy case study naming GMGN. I found no published third-party security audit of GMGN's wallet system, only the bug bounty.
- The legal entity, jurisdiction and terms-of-service custody language were not checked, because gmgn.ai was blocked.

## 3. How GMGN orders execute (who signs at trigger, bonding curve vs graduated, price source)

### Takeaway
Execution is off-chain and server-driven. GMGN's backend watches prices and, when a trigger is hit, builds and submits a swap from the GMGN-held wallet with the user's preset slippage, priority/tip fee and anti-MEV route. Orders work on pump.fun bonding-curve tokens (copy-trade "Pump" filter, Migrated Snipe for "ungraduated tokens") and on DEX pools after migration. Trading pauses during the migration window.

### Cited Findings
- Triggered orders can fail with "insufficient wallet balance when the order is triggered" (K2, not on chain) or with too few tokens (K3). Untriggered orders show error J1 ("pin"). Bot limit order errors include "order10001: To increase success rate, set more tip". — [GMGN docs: Transaction/Limit Order failure](https://docs.gmgn.ai/index/transaction-limit-order-failure)
- L2 error: "Solana pump.fun, moonshot and other tokens cannot be traded when the token market value reaches $69K and the official is adding a pool and waiting for the opening of Raydium/Meteora DEX". — same page (2025-08; the venue names predate PumpSwap-era docs)
- Migrated Snipe fires "when DEX adds official LP" and applies to "ungraduated tokens". — [GMGN docs: Migrated Snipe](https://docs.gmgn.ai/index/auto-trading-migrated-snipe)
- The order UI requires a GMGN wallet ("bind TG bot wallet") and plugin wallets lack automation. — [Auto Buy & Limit buy](https://docs.gmgn.ai/index/auto-buy-auto-buy-limit-buy); [Multi-Wallet system](https://docs.gmgn.ai/index/tg-wallet-connect-tg-multi-wallet-system)

### Inferences
- Because orders fire while the user is offline and only work with GMGN-held wallets, GMGN's servers must be able to sign for those wallets at trigger time. GMGN never states this in words, but no other mechanism fits the documented behaviour.
- No on-chain escrow or order program is described anywhere in GMGN's docs.

### Gaps
- GMGN does not document the trigger price source (its own indexer, last trade or pool quote), how often it polls, or whether triggers use market cap or price internally.
- No current doc confirms PumpSwap explicitly as a venue, though copy-trade filters mention PumpFun and Raydium.

## 4. Peers (wallet model, who signs at trigger, bonding-curve support)

### Takeaway
The industry pattern is the same everywhere: a provider-generated hot wallet plus server-side conditional execution. Peers differ mainly on whether the key is exportable. Axiom uses Turnkey with an exportable seed. Bloom and Trojan use Telegram-bot wallets with export. GMGN does not allow export. Jupiter is the one notable alternative with a documented model: Trigger V2 moves funds into a per-user vault that its docs call "custodial by Privy" (the user docs say program-owned), and keepers execute from it. Jupiter Trigger V1 used on-chain PDA order accounts. No peer I found signs at trigger time on the user's own device.

### Cited Findings
**Axiom**
- Axiom docs: "Axiom uses industry-leading security measures including non-custodial infrastructure... visit our partner Turnkey". — [Axiom FAQs](https://docs.axiom.trade/faqs) (last updated 2025-03-13)
- Sign-up is by email, Google or Phantom. Users are shown a seed phrase ("Access your recovery phrase at any time in your settings!") and encouraged to import it into Phantom/Solflare. — [Axiom docs: Signup](https://docs.axiom.trade/getting-started/signup) (2025-02-03)
- Turnkey case study (2025-09-19): Axiom wanted "secure key storage and signing flows" and proof of "non-custodial status". Turnkey's "policy engine" and "Programmable Key Management" "enabled us to automate onchain actions without compromising security" (CTO Preston Ellis). Axiom claims over 1M users and more than $100M revenue. — [Turnkey: Axiom case study](https://turnkey.com/customers/axiom-global-defi-trading-platform)
- Limit orders use a slider or a draggable chart line. Migration Actions offer a sniper buy at pump.fun to Raydium migration and a migration sell. — [Axiom docs: Limit Orders](https://docs.axiom.trade/axiom/swap/limit-orders); [Migration Actions](https://docs.axiom.trade/axiom/swap/migration-actions) (2025-02-04)
- Fees: 0.95% (Wood) down to 0.75% net (Champion) after cashback. — [Axiom docs: Fees](https://docs.axiom.trade/getting-started/fees/axiom-fees) (2025-05-03)
- Secondary: limit orders execute in "≤1 block" using colocated nodes. "Auto-Strategies" buy and place limit sells in one action. — [IQ.wiki: Axiom](https://iq.wiki/wiki/axiom.md)
- 2026-02-26: ZachXBT alleged that Axiom BD staff used internal support tools to look up users' wallets and front-run them. Axiom removed tool access and opened an investigation. — [The Block](https://www.theblock.co/post/391423/zachxbt-investigation-into-alleged-employee-insider-trading); [Decrypt](https://decrypt.co/359223/y-combinator-backed-axiom-employees-accused-insider-trading-zachxbt)
- Secondary, from a hardware-wallet vendor (biased): "Axiom's wallet is non-custodial... provisions a wallet for you through Turnkey... recovery phrase... is exportable". — [Ryder blog, 2026-09-20](https://ryder.id/blogs/post/is-axiom-trade-safe-what-the-wallet-holds-and-what-the-platform-knows)

**Jupiter (relevant architecture alternative)**
- Trigger V2 supports limit orders, TP/SL (OCO), OTOCO, trailing triggers and DCA. "Orders are stored off-chain and private by default". Deposits go to "Vault accounts (custodial) by Privy", one vault per wallet. Trigger V1 used "Program-derived address (PDA) order accounts" with pool-rate triggers and visible on-chain orders. Auth is a signed challenge and a JWT. V2 DCA minimum is $10 per round. — [Jupiter dev docs: Trigger Order API](https://developers.jup.ag/docs/trigger.md) (fetched 2026-10-24)
- User docs: triggers use USD price or market cap. A "keeper... executes the trade through Jupiter Ultra". Funds sit in a "program-owned" vault "so there is no private key for it". Expiry options are 1h, 1d, 1 week (default), 30d or custom. Partial fills are possible. Cancelling requires the user to sign the withdrawal. V2 fee is 0.03–0.1% base plus a 0–0.5% Ultra routing fee. — [Jupiter user docs: Limit Orders](https://docs.jup.ag/user-docs/trade/swap/limit-orders.md)
- Conflict: the developer docs say "custodial by Privy" while the user docs say "program-owned... no private key". This should be checked before relying on either.

**Bloom (secondary only)**
- Bloom generates a Solana wallet on first start, which users can back up or export. Limit orders "run on Bloom's infrastructure — the bot monitors the price and executes", and are "not on-chain limit orders like those offered by Jupiter". — [MadeOnSol: How to use Bloom (affiliate site, 2026-03-27, updated 2026-09-30)](https://madeonsol.com/blog/how-to-use-bloom-trading-bot)

**Trojan, Photon, BullX Neo, Padre (secondary only, low confidence)**
- Trojan is described as self-custodial with key export, has limit orders, DCA, copy trading and sniping, and charges about 0.9% per trade. — [MadeOnSol: Trojan review](https://madeonsol.com/blog/trojan-bot-review); [QuickNode listing](https://www.quicknode.com/builders-guide/tools/trojan-on-solana-by-trojan-team)
- Photon is described as "non-custodial" with "encrypted private key storage". I found no export procedure. — [Bitrue blog (2025)](https://www.bitrue.com/blog/photon-sol-how-it-works-and-what-you-need-to-know-in-2025)
- BullX Neo generates wallets tied to Telegram. Sources conflict on export: one says the key can be downloaded within 48h of creation, another says download is "one time only". — [Publish0x: BullX export private key](https://www.publish0x.com/solana-trading-bots/bullx-export-private-key-xgnyzmw); [Notion guide](https://fomosol.notion.site/Wallet-Management-Trading-w-BullX-62ddcdc8a243409aae0ed3b87877d657)
- Padre is described as non-custodial with limit orders, DCA and copy trading at about 1% fee. Its execution model is unverified. — [MadeOnSol: Padre](https://madeonsol.com/tools/padre)

**Phantom**
- Phantom Perps (Hyperliquid-backed, launched July 2025, EU first, UK barred) added limit and TP/SL orders around 2025-11-04. I found no native spot memecoin limit or stop orders in Phantom. — [ValueTheMarkets](https://www.valuethemarkets.com/cryptocurrency/news/phantom-introduces-limit-orders-for-enhanced-perpetual-futures-trading); [ForkLog](https://forklog.com/en/phantom-introduces-perpetual-futures-trading-with-hyperliquid-support/)

**pump.fun app**
- 2026-09-02: "Pump.fun has launched limit orders on Solana, enabling users to place take-profit and stop-loss orders directly in the Pumpfun app." — [Phemex News, 2026-09-02](https://phemex.com/news/article/pumpfun-launches-solana-limit-orders-with-takeprofit-and-stoploss-tools-95256); [Crypto Briefing](https://cryptobriefing.com/pumpfun-limit-orders-solana-tokens/)

### Inferences
- Every peer that offers offline TP/SL has the provider's backend sign at trigger time. They do it with a key they hold (GMGN, Telegram bots), a key in a policy-controlled enclave such as Turnkey (Axiom, inferred from the "automate onchain actions" quote), or by moving funds into a vault the provider's keeper controls (Jupiter V2).
- For a strictly non-custodial app like Sift, the realistic options are:
  - (a) Device-side triggers: the app stays alive, or a notification prompts the user to sign. This is unreliable for a stop-loss.
  - (b) On-chain or escrow order programs, such as Jupiter Trigger V1-style PDAs. These cannot trade on the bonding curve unless the program supports it.
  - (c) Delegated, scoped signing through a Turnkey/Privy-style policy key that may only sell token X to the user's own wallet. Whether (c) counts as "never holds keys" is a product and legal decision.
  - (d) Pre-signed transactions. These do not work on Solana because blockhashes expire in about 60–90 seconds unless durable nonces are used, and even then fixed amounts and routes would go stale. This is an inference from general Solana knowledge; I did not verify it in this research.

### Gaps
- No official docs found for Photon, BullX, Trojan, Bloom or Padre on where keys live or who signs at trigger. All peer findings except Axiom and Jupiter are secondary or affiliate sources.
- The Axiom docs don't state explicitly that Axiom's servers sign triggered limit orders through Turnkey policies. This is inferred.
- pump.fun's wallet model for its app orders is unknown.

## 5. Regulatory / app-store notes

### Takeaway
Little hard data. The main confirmed items are that Phantom geo-limited its perps product (EU first, UK barred) and that GMGN openly describes its Phantom-login wallets as custodial, which matters for custody regulation.

### Cited Findings
- Phantom Perps launched first to EU users, with UK users reportedly barred. — [ForkLog](https://forklog.com/en/phantom-introduces-perpetual-futures-trading-with-hyperliquid-support/)
- Turnkey frames non-custodial wallets as reducing "regulatory risks by ensuring the provider never controls user funds or keys". — [Turnkey: Axiom case study, 2025-09-19](https://turnkey.com/customers/axiom-global-defi-trading-platform)
- GMGN's docs include a "Delete APP account" page and describe an app, which confirms a mobile app exists. — [GMGN docs index](https://docs.gmgn.ai/index/gmgn-fees-settings)

### Inferences
- A GMGN-style design, with provider-generated, non-exportable, server-signing wallets, would likely be treated as custodial (money-transmitter or CASP under MiCA). This is my inference, not legal advice.

### Gaps
- GMGN's App Store/Play Store availability by country, any US geo-block, and its terms of service: not found (search returned nothing; gmgn.ai blocked).
- No information was found on app-store policies specific to Telegram-bot custodial wallets.
