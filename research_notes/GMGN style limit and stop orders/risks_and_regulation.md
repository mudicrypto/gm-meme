# Risks and regulatory implications of GMGN-style automated limit / take-profit / stop-loss orders in a non-custodial Solana meme-coin app (as of 24 Oct 2026)

> **Not legal advice.** These are research notes from public sources, many of them secondary (law-firm blogs, vendor blogs, crypto news). Primary-law text is marked as such. All URLs were accessed on 2026-10-24. "Pub." is the publication date where it was visible, otherwise it is marked "n.d.". Several primary sites (vara.ae, rulebooks.vara.ae Schedule 1 of the Regulations, the ADGM rulebook) could not be fully retrieved from this environment, so their operative wording is a gap that a lawyer must check.

## 1. Regulation: custody and licensing status of each approach (UAE VARA, ADGM, CBUAE/SCA, US FinCEN, EU MiCA, app stores)

### Takeaway

Every regime found uses the same test: does the operator control, or co-control, the means of moving the user's assets? That test puts (e) a GMGN-style operator-usable trading wallet, and very likely (d) Sift's own escrow program if it has admin or upgrade powers, inside custody. It also probably puts them inside brokerage/execution. (b) delegated signing and (c) keeper-submitted pre-signed transactions are grey zones that depend on scope and revocability. (a) Jupiter Trigger V2 moves the custody question to Jupiter/Privy: Jupiter's own developer docs call the V2 vaults "custodial". The biggest UAE change is the federal CBUAE law (Federal Decree-Law No. 6 of 2025). Its transition period reportedly ended on 16 Sep 2026, and commentators read its Article 62 as reaching technology that "facilitates" licensed financial activity. That would weaken any "just software" defence.

### Cited Findings

**UAE: VARA (Dubai, outside DIFC)**

- VARA is "the sole authority regulating virtual assets across Dubai's free zones and mainland, except within the jurisdiction of Dubai International Financial Centre (DIFC)" (primary, VARA rulebook site footer, ©2026). — [VARA Custody Services Rulebook, Schedule 1 – Definitions](https://rulebooks.vara.ae/node/257) (n.d., ©2026)
- The Custody Services Rulebook does not define "Custody Services" itself: "'Custody Services' has the meaning ascribed to it in Schedule 1 of the Regulations" (primary). It also defines "Collateral Wallet Services" and "Staking from Custody Services" ("staking or otherwise using, committing, pledging or locking up Virtual Assets, for which the VASP is providing Custody Services…"). — [VARA Custody Services Rulebook, Schedule 1](https://rulebooks.vara.ae/node/257)
- Secondary paraphrase of the Regulations' Schedule 1: Custody Services is the "safekeeping of VAs for or on behalf of another entity and acting only on instructions from or on behalf of such entity." — [AML UAE, "What are Virtual Asset Activities…"](https://amluae.com/?p=41089) (n.d., secondary)
- Secondary: Custody Services Rulebook Art. 3.1 is described as covering "receiving, safeguarding, or controlling" a client's assets, with signing control or co-control over hot, warm or cold wallets treated as safekeeping. Custody must sit in a separate legal entity, assets must be segregated per client, and rehypothecation is barred even with consent. — [Al Safar & Partners (LinkedIn), "VARA Custody Services Rulebook"](https://www.linkedin.com/pulse/vara-custody-services-rulebook-alsafarandpartners-lawfirm) (n.d., secondary law-firm); [Farahat & Co, VARA Company Rulebook](https://farahatco.com/blog/vara-company-rulebook/) (n.d., secondary)
- Secondary: the VARA licensed activities are Advisory, Broker-Dealer, Custody, Exchange, Lending & Borrowing, VA Management & Investment, VA Transfer & Settlement, plus Issuance under a separate rulebook. Broker-Dealer covers arranging and matching orders, dealing on own account and market-making, and carries duties on best execution, conflicts, and protection of client assets and order flow. — [ABS Partners, "Understanding VARA Licensed Activities"](https://abspartners.ae/vara-licensed-activities-dubai-regulatory-framework-guide/) (n.d., secondary); [10 Leaves, VARA License Guide 2026](https://10leaves.ae/publications/blockchain-crypto/guide-to-vara-licenses) (2026, secondary)
- VARA published Version 2.0 of its activity rulebooks. Secondary sources give 19 June 2025 as the effective date, and the Custody Services Rulebook is listed as "Effective From: 19 June 2025". — [VARA news: "VARA Issues Updated Activity Rulebooks…"](https://www.vara.ae/en/news/vara-issues-updated-activity-rulebooks-to-strengthen-market-integrity-and-risk-oversight/) (2025, primary, not fetched: DNS failure); [Solidus Labs, VARA 2025 Rulebook Update](https://www.soliduslabs.com/post/vara-2025-rulebook-update-vasp-compliance) (2025, secondary); [Aston, VARA rulebook updates 2025](https://aston.ae/vara-rulebook-updates-2025/) (2025, secondary)
- Secondary: a broker or exchange cannot simply hold client assets in self-hosted wallets without dedicated procedures, insurance and board oversight. Broker-dealer capital requirements differ depending on whether a VARA-licensed custodian is used. — [VARA Custody Services Rulebook summary, Al Safar](https://www.linkedin.com/pulse/vara-custody-services-rulebook-alsafarandpartners-lawfirm) (n.d., secondary)
- **No VARA guidance was found that defines or exempts "non-custodial" or self-custody wallet software.** One vendor blog claims a "VARA-based crypto wallet app provision license" exists. This is unverified and probably marketing. — [Antier, VARA Compliant Crypto Wallet Development 2026](https://www.antier.com/blogs/vara-compliant-crypto-wallet-development-the-2026-technical-playbook/) (2026, vendor, low reliability)

**UAE: ADGM FSRA (Abu Dhabi)**

- The ADGM rulebook section "Custodial Arrangements for Clients' Virtual Assets" is quoted in search results as saying that "Type 3 non-custodial wallet providers would generally not be required to seek an FSP to Provide Custody because they have no control over client assets". This is primary text, seen only as a search snippet because the full page did not load. — [ADGM Rulebook, Custodial arrangements for clients' Virtual Assets](https://en.adgm.thomsonreuters.com/rulebook/custodial-arrangements-clients-virtual-assets) (n.d.)

**UAE: federal (CBUAE / SCA)**

- Federal Decree-Law No. 6 of 2025 (the new Central Bank law) reportedly took effect on 16 Sep 2025 with a one-year transition, so firms had until **16 Sep 2026** to comply. Article 62 is reported to cover anyone who "engages in, offers, issues, or facilitates" a Licensed Financial Activity "by any means, medium or technology". Commentators read this as including DeFi protocols, middleware and infrastructure. Reported penalties reach AED 1 billion, with criminal sanctions for unlicensed activity. One source says the CBUAE may extend the transition, and no confirmation of an extension was found. — [Al Maazmi Lawyers, "UAE Central Bank Law 2025"](https://www.almaazmilawyers.com/insights/banking/2026-05-18-federal-decree-on-central-bank-financial-institutions-and-in) (2026-05-18, secondary law-firm); [Databird Journal, "End of the 'Just Code' Defense"](https://www.databirdjournal.com/posts/uaes-federal-decree-law-no-6-of-2025-the-end-of-the-just-code-defense-for-defi-and-the-dawn-of-comprehensive-crypto-regulation) (n.d., commentary); [LARA on the Block](https://laraontheblock.com/uae-central-bank-to-oversee-virtual-asset-payment-and-defi-ecosystem/) (n.d., commentary); [Uppersetup, UAE Financial Services Licensing 2026](https://uppersetup.com/en/blog/uae-financial-services-licensing-2026-cbuae-cma-dfsa-fsra) (2026, secondary)
- No primary gazette text of Article 62 was retrieved. All of the above is commentary.

**US: FinCEN 2019 guidance (FIN-2019-G001, 9 May 2019)**

- Whether a wallet provider is a money transmitter depends on four factors: who owns the value, where it is stored, whether the owner interacts directly with the payment system, and whether the intermediary has "total independent control" over the value. Owners of unhosted wallets are not money transmitters. A multisig provider that only adds a second authorisation key, validating at the owner's request, lacks total independent control and is not a money transmitter. A trading platform that only matches buyers and sellers is not an exchanger, but one that buys from the seller and sells to the buyer is. — [Katten client alert (2019-06-26)](https://katten.com/fincen-publishes-guidance-pertaining-to-certain-business-models-involving-convertible-virtual-currencies) (secondary law-firm summary of primary guidance); [Jones Day (2019-06)](https://www.jonesday.com/en/insights/2019/06/fincen-consolidates-guidance) (secondary); [Coin Center (2019)](https://coincenter.org/fincens-new-cryptocurrency-guidance-matches-coin-center-recommendations/) (commentary)
- The guidance is interpretive, not binding, and state money-transmitter rules can differ. — [Orrick blog (2019)](https://blogs.orrick.com/blockchain/fincens-new-guidance-for-cryptocurrency-businesses-some-questions-answered-some-new-questions-raised-careful-consideration-a-must/) (secondary)

**EU: MiCA / ESMA**

- Commentators read the MiCA custody definition (Art. 3: safekeeping or controlling crypto-assets, or the means of access to them, on behalf of clients) and the Commission/ESMA Q&A as turning on key control. If only the client holds the keys, the provider is outside custody and outside the CASP regime. The grey zone is software that helps create, store or use signing material, where the decisive question is who holds signing and recovery authority. Separately, pre-funding with client crypto-assets is said to count as sub-custody. Q&A numbers quoted online (e.g. "Q&A 2882") were **not verified** against ESMA. — [Dudkowiak, Crypto services under MiCA 2026](https://www.dudkowiak.com/fintech-in-poland/crypto-services-under-mica/) (2026, secondary law-firm); [Manimama, "When temporary holding becomes custody"](https://manimama.eu/when-temporary-holding-becomes-custody-mica-s-red-line-for-client-crypto-assets/) (n.d., secondary law-firm); [Lexology, "MiCAR: ESMA defines scope"](https://www.lexology.com/library/detail.aspx?g=ce9f2145-a445-459e-916a-3b559dfda5bb) (n.d., secondary)
- When the MiCA transitional period ended, ESMA told clients of unauthorised CASPs to move assets to an authorised CASP or to a self-hosted wallet. — [AMF relay of ESMA public statement](https://www.amf-france.org/en/news-publications/news/esma-public-statement-esma-calls-unauthorised-crypto-asset-service-providers-wind-down-orderly-while) (n.d., primary regulator)

**App stores**

- Apple App Review Guideline 3.1.5 (primary; page "Last Updated: October 16, 2026"): "(i) Wallets: Apps may facilitate virtual currency storage, provided they are offered by developers enrolled as an organization… (iii) Exchanges: Apps may facilitate transactions or transmissions of cryptocurrency on an approved exchange, provided they are offered only in countries or regions where the app has appropriate licensing and permissions to provide a cryptocurrency exchange. (iv) … cryptocurrency futures trading, and other crypto-securities or quasi-securities trading must come from established banks, securities firms…" — [Apple App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (updated 2026-10-16, primary)
- Developers report 3.1.5(iii) rejections that do not say which licence is missing ("locations where you or your service providers have not provided supporting evidence"). Apple has asked whether transactions are between users or handled by the developer, and about AML/KYC. — [Apple Developer Forums thread 810590](https://developer.apple.com/forums/thread/810590) (n.d., anecdotal); [thread 719871](https://developer.apple.com/forums/thread/719871) (n.d., anecdotal)
- Google Play's "Cryptocurrency Exchanges and Software Wallets" policy requires local licensing per listed country (US: FinCEN MSB plus state money-transmitter registration, or a bank charter). Google said in Aug 2025 that **non-custodial wallets are not in scope**. Enforcement was reported for 29 Oct 2025. — [Google Play Console Help 16329703](https://support.google.com/googleplay/android-developer/answer/16329703) (n.d., primary); [Decrypt (2025-08)](https://decrypt.co/335134/google-non-custodial-wallets-exempt-new-crypto-app-rules-play-store) (secondary); [The Block (2025-08)](https://www.theblock.co/post/366841/googles-app-store-banning-unregistered-non-custodial-crypto-wallets) (secondary)

**Approach (a), Jupiter Trigger V2: what Jupiter itself says**

- Jupiter developer docs, primary: Trigger V2 "Deposits: Vault accounts (custodial) by Privy". "Each wallet gets a single vault (a Privy-managed custodial account)". "Orders are stored off-chain and private by default". "Output amount: Not guaranteed (prioritises trigger execution…)". V1 used on-chain PDA order accounts, with pending orders visible on-chain. V1 gets critical-only updates, and all development is on V2. V2 supports single orders (including a trailing trigger), OCO (TP+SL) and OTOCO. Auth is a challenge-response JWT plus an API key. Token-2022 mints with transfer fees or hooks are excluded unless whitelisted. — [Jupiter Developer Docs, Trigger Order API Overview](https://developers.jup.ag/docs/trigger.md) (n.d., fetched 2026-10-24, primary)
- **Conflict:** the Jupiter user docs describe the same vault as "a secure program-owned account… the vault is program-owned, so there is no private key for it". Fees are "0.03–0.1% base + Ultra routing fee (0–0.5%)". Sign-in alone can cancel an order, but withdrawals need a signature. — [Jupiter user docs, Limit Orders](https://docs.jup.ag/user-docs/trade/spot/limit-orders) (n.d., primary). The developer docs say "custodial… by Privy", so the custody characterisation of (a) is unresolved and needs written confirmation from Jupiter.
- The Jupiter docs, as quoted in search results, say: "Stop Loss is not guaranteed to execute. When the trigger price is hit, the order is submitted for execution with your slippage tolerance applied." — [Jupiter Limit Orders docs](https://docs.jup.ag/user-docs/trade/swap/limit-orders) (n.d., primary, via search snippet)

**Approach (b), delegated signing (Privy)**

- Privy's policy engine runs inside a TEE (AWS Nitro Enclaves) and enforces contract/recipient allow-lists, deny-lists, spend limits and quorums before signing. Keys are sharded and only reconstructed temporarily. "If an authorization key is set as a signer on the wallet, then it can transact funds on the wallet". `useSessionSigner` replaces the older `useDelegatedActions`. — [Privy docs, Authenticated signers](https://docs.privy.io/guide/security/authentication/authenticated-signers) (n.d., primary vendor); [Privy docs, TEE wallet migration guide](https://docs.privy.io/recipes/tee-wallet-migration-guide) (n.d., primary vendor); [Privy blog, How Privy embedded wallets work](https://privy.io/blog/how-privy-embedded-wallets-work) (n.d., vendor)
- No Turnkey documentation was retrieved (gap).

### Inferences

- **(e) GMGN-style operator-usable trading wallet:** this is signing control by the operator. It almost certainly meets the VARA safekeeping/"controlling" concept (Custody, plus probably Broker-Dealer because Sift executes orders), the FinCEN "total independent control" test, the MiCA custody test, Google's custodial scope and Apple 3.1.5(iii). It also contradicts Sift's own CLAUDE.md non-negotiable ("never holds… private keys").
- **(d) Sift-built escrow program:** if Sift holds upgrade authority or any admin or withdraw path, regulators could treat it as co-control. An immutable program with user-only withdrawal and a permissionless keeper is the strongest non-custodial argument, but no UAE source confirms it. Under Art. 62's "facilitates… by any means… technology" (as commentators read it), even immutable code may not escape CBUAE scope.
- **(b) delegated signing:** a server-side authorisation key that "can transact funds" is functionally co-control. Narrow, user-revocable, TEE-enforced policies (sell-only, to the user's own wallet, capped) resemble FinCEN's "additional validation at the request of the owner" multisig case, but an operator key that can initiate is different. The outcome depends on policy scope and on whether Sift or Privy holds the authorisation key.
- **(c) user-pre-signed durable-nonce transactions:** the keeper holds no key and can only broadcast exactly what the user signed. This looks closest to "the owner retains total independent control" under FinCEN and the MiCA control test. The keeper still decides _when_ to execute, which may look like order execution or arranging (VARA Broker-Dealer). That question is unresolved.
- **(a) Jupiter V2:** Sift would be routing users into a vault Jupiter itself labels "custodial… by Privy". Sift may not be the custodian, but it could be seen as arranging or introducing custody, and Apple and Google may treat the app as facilitating a custodial service. Jupiter V1 (on-chain PDA escrow, no stop-loss) avoids Privy custody but has no SL.

### Gaps

- The verbatim Schedule 1 definitions in VARA's Virtual Assets and Related Activities Regulations 2023, and any 2025–2026 amendments, could not be retrieved (DNS failures on vara.ae and the Thomson Reuters mirrors). Secondary paraphrases only.
- No VARA guidance on non-custodial wallets, keepers or smart-contract escrow was found. It is unknown whether such guidance exists.
- The Article 62 wording, any CBUAE implementing regulations, and whether the 16 Sep 2026 deadline was extended are not confirmed from primary sources. The position of the SCA (onshore, outside Dubai VARA) was not researched in detail.
- No ESMA Q&A text was verified. The 2025–2026 MiCA Level 2/3 updates on custody were not checked.
- Whether Jupiter's V2 vault is custodial is contradictory between Jupiter's two doc sets.
- No regulator decision anywhere specifically on "pre-signed transaction + keeper" was found.

## 2. Market risks for stop-losses on thin meme coins

### Takeaway

On meme coins the stop price is easy to manipulate and often meaningless. Academic work finds that most high-return meme coins show artificial price inflation, and Jupiter itself says stop-losses are not guaranteed to execute. A triggered stop on a rug, liquidity pull, freeze or honeypot may fill far below the trigger, or not at all.

### Cited Findings

- In a study of 34,988 meme tokens across Ethereum, BNB, Solana and Base, about 82.8% of high-return tokens (v2 abstract; v1 says 82.6%) showed artificial growth, through wash trading or "Liquidity Pool-Based Price Inflation". Solana tokens are manipulated earliest (median 62 days after creation vs ≥101 days on other chains), and pump-and-dumps or rug pulls typically follow. — [arXiv 2507.01963, "A Midsummer Meme's Dream"](https://arxiv.org/abs/2507.01963v2) (2025, academic preprint)
- A study of about 6,000 pump.fun coins separates wash trading, sniping and comment bots, and finds attention manipulation attracts traders and redistributes wealth. — [SBFC 2025 paper P154](https://sbfc.sydney.edu.au/2025/papers/SBFC2025_4G3_P154.pdf) (2025, academic conference)
- A TUM thesis finds substantial wash trading in Solana AMM tokens, concentrated among few accounts. — [Wiedenmann, TUM Master's thesis](https://www.cs.cit.tum.de/fileadmin/w00cfj/sebis/thesis/250610_Wiedenmann_Thesis.pdf) (2025-06-10, student thesis)
- Bitquery traced about $500K of fake volume on one meme coin in 12 hours to one funder wallet seeding around 200 bots. — [Bitquery, "Solana volume numbers are a lie"](https://bitquery.io/blog/solana-volume-numbers-are-a-lie) (2026-04, industry blog)
- Jupiter: "Stop Loss is not guaranteed to execute… submitted for execution with your slippage tolerance applied". V2 output is "not guaranteed". — [Jupiter Limit Orders](https://docs.jup.ag/user-docs/trade/swap/limit-orders) (n.d., primary); [Jupiter Trigger API overview](https://developers.jup.ag/docs/trigger.md) (n.d., primary)
- pump.fun graduation: a token migrates when the bonding curve sells out (about 85 SOL raised / about $69k market cap in one sample period). Since March 2025 it migrates to PumpSwap (0.25% fee) instead of Raydium. — [The Block, PumpSwap launch](https://www.theblock.co/post/347360/pump-fun-launches-dex-called-pumpswap-to-instantly-migrate-graduated-tokens) (2025-03, secondary); [Bitquery docs, Pump.fun to PumpSwap](https://docs.bitquery.io/docs/examples/Solana/pump-fun-to-pump-swap) (n.d.)
- Solana Compass headline: of 42,000 tokens launched on pump.fun in one day, "fewer than 2% will ever reach a DEX". — [Solana Compass](https://solanacompass.com/news/pumpfun-launched-42000-tokens-in-one-day-fewer-than-2-will-ever-reach-a-dex) (n.d., secondary)

### Inferences

- **Trigger manipulation and stop hunting:** if the trigger is a USD price derived from thin pools (Jupiter V2 uses a USD price), a single wash trade or flash dump can trip stops. The manipulator then buys back the dumped tokens cheaply. A short confirmation window, a TWAP trigger, or a minimum-liquidity gate would reduce this. This is an inference with no quantified source.
- **Gap risk:** rugs (LP removal), freeze authority (the holder cannot transfer, so the sell fails), and honeypots (sell blocked or taxed by Token-2022 hooks or fees) mean a stop either fails or fills near zero. Jupiter V2 already excludes transfer-fee and transfer-hook mints unless whitelisted ([Jupiter](https://developers.jup.ag/docs/trigger.md)).
- **Graduation:** an order routed to the bonding-curve program will fail once the curve is complete and liquidity has moved to PumpSwap. Orders must be re-routed at migration. No source specifically documents stop-loss failures at graduation (gap).

### Gaps

- No quantified data on stop-loss fill quality (realised price vs trigger) for Solana meme coins.
- No source on freeze-authority or honeypot frequency among pump.fun tokens, or on sell failures at graduation.

## 3. MEV on Solana (2025–2026): sandwich risk for triggered market sells

### Takeaway

Sandwiching on Solana is real and concentrated on pump.fun meme coins, because traders set wide slippage. Jito shut its public mempool in March 2024, which pushed sandwiching into private mempools. Routing products like Helius MEV Protect reduce the risk but do not remove it. A triggered stop-market sell with wide slippage is close to the ideal sandwich target.

### Cited Findings

- Helius MEV report (Jan 15 2025): Jito suspended its mempool in March 2024. "the decision has encouraged the rise of alternative mempools that lack transparency". "Memecoin traders are especially susceptible to sandwich attacks, as they set high slippage tolerances when trading illiquid and highly volatile assets". One sandwich bot ("Vpe") made about 758 SOL/day ($4.63M over Dec 7 2024–Jan 5 2025), averaging 0.0425 SOL ($8.67) per sandwich, and 16 of its top 20 sandwiched tokens were pump.fun tokens. Much sandwiching came from a private mempool run by one entity, DeezNode. Jito-Solana validators had 92% of stake by early 2025. — [Helius, Solana MEV Report](https://www.helius.dev/blog/solana-mev-report) (2025-01-15, primary industry research)
- sandwiched.me research, as reported: $370–500M extracted from Solana users over 16 months, sandwiches in about 0.72% of blocks, up to 27% of blocks for some validators. A 60–70% drop in sandwich profitability in 2025 is attributed to coordinated action, including Marinade blacklisting 50+ validators. These figures are secondary and unverified. — [MEXC News](https://www.mexc.com/news/335217) (2025, secondary; it misdates the Jito mempool closure as March 2025)
- Anza's Max Resnick says sandwiching is "way down", crediting code changes more than blacklisting, and blacklisted operators can re-emerge under new identities. — [Blockworks](https://blockworks.co/news/solana-sandwich-attacks-down) (2025, secondary)
- Helius MEV Protect (opt-in `mev-protect=true`) avoids submitting to validators "statistically associated with sandwich activity" in their own or adjacent blocks. It works with sendTransaction, sendBundle and Sender. "Wide sandwiching" can span multiple blocks, so protection gives "a much lower chance", not zero. — [Helius docs, MEV Protect](https://www.helius.dev/docs/sending-transactions/mev-protect) (n.d., primary)
- Jupiter V2 keeps pending orders off-chain, "closing the most common MEV attack vector of visible pending orders". V1 orders were visible on-chain. — [Jupiter Trigger API overview](https://developers.jup.ag/docs/trigger.md) (n.d., primary)

### Inferences

- A sell order that is visible on-chain (V1 PDAs, or Sift's own escrow program) lets bots pre-position against known triggers. Off-chain order storage plus private or protected submission is better.
- The maximum loss to a sandwich is roughly the slippage tolerance. Default stop slippage should be bounded and shown as "minimum received", in line with Sift's own non-negotiable on showing full cost.

### Gaps

- No primary 2026 sandwich-volume figures. The sandwiched.me numbers were not checked at source.
- No data on the residual sandwich rate under Helius MEV Protect or Jito bundles.

## 4. Security risks per design (incidents 2022–2026)

### Takeaway

The trading-bot model, with the operator holding or using keys, has a run of breaches and drains. Durable nonces were central to the ~$270M Drift exploit in April 2026 and are a known phishing primitive. Solana program exploits from bugs in signature checks, minting or oracles have cost hundreds of millions, so a custom escrow program carries real audit risk.

### Cited Findings

- **GMGN (Oct 2025):** a phishing campaign using a forged third-party token site led to unauthorised transactions on about 107 users' accounts, with more than $700k lost. Private keys were reportedly _not_ leaked. Attackers reportedly captured GMGN session tokens (access and refresh tokens), used them to make the accounts buy into "Pixiu" (honeypot) pools, and withdrew from those pools. GMGN said it would compensate in full. — [Phemex News](https://phemex.com/news/article/gmgn-users-targeted-in-700000-phishing-scheme-exploiting-pi-xiu-pools-30761) (2025-10, secondary); [Odaily](https://www.odaily.news/en/newsflash/454353) (2025-10, secondary)
- **SIGMA bot (May 2026):** a trader lost more than $200k from two wallets created in the SIGMA Telegram bot and imported into GMGN and Rabby. The suspected cause is a key leak through phishing or an infostealer. GMGN was not shown to be at fault. — [Cryptopolitan](https://www.cryptopolitan.com/crypto-trader-loses-200k-telegram-bot/) (2026-05, secondary); [Crypto Times (2026-05-11)](https://www.cryptotimes.io/2026/05/11/crypto-trader-drained-of-200k-in-telegram-bot-linked-crypto-hack/) (secondary)
- **Banana Gun (Sep 2024):** $3M was drained from 11 users through a "vulnerability in the Telegram message oracle". EVM and Solana bots were paused, users were refunded from the treasury, and fixes included a 2-hour transfer delay and 2FA. — [The Block (2024-09-25)](https://www.theblock.co/post/318074/banana-gun-exploit-refund) (secondary); [Rekt, Banana Gun](https://rekt.news/bananagun-rekt) (2024, commentary)
- Rekt also reported that Maestro lost about $200k and that Unibot acknowledged an "ongoing exploit", with no detailed reports. — [Rekt](https://rekt.news/bananagun-rekt) (2024)
- BONKbot and Solareum users lost about $520k in key-leak hacks (2024). — [ForkLog](https://forklog.com/en/telegram-bots-bonkbot-and-solareum-users-suffer-520000-losses-due-to-hacks/) (2024, secondary)
- **Durable nonce / Drift (Apr 1–2 2026):** at least $270M was drained. Attackers socially engineered Security Council multisig signers into pre-signing admin transactions with durable nonces, which keep a transaction valid indefinitely, and executed them later. The drain took under a minute after more than a week of setup. GoPlus warns that durable-nonce transactions are used to trick users into signing transactions whose malicious effects stay executable indefinitely. — [CoinDesk (2026-04-02)](https://www.coindesk.com/tech/2026/04/02/how-a-solana-feature-designed-for-convenience-let-an-attacker-drain-usd270-million-from-drift) (secondary); [ForkLog, Drift loses $280M](https://forklog.com/en/news/drift-protocol-on-solana-loses-280m) (2026-04, secondary; the loss figure differs)
- **Solana program exploits:** Wormhole (Feb 2022, about $326M, a deprecated signature-verification function let forged signatures mint 120k wETH). Cashio (Mar 2022, about $52M, infinite mint through missing validation). Mango Markets (Oct 2022, about $116M, oracle/collateral manipulation). CertiK counted 11 major Solana attacks in 2022 worth about $523M. Helius catalogues 26 Solana application exploits. Loopscale (2025) recovered $5.8M. — [Helius, Solana Hacks](https://www.helius.dev/blog/solana-hacks) (n.d., industry); [CertiK 2022 Solana Exploits Overview](https://www.certik.com/blog/2022-solana-exploits-overview) (2023, industry); [Pine Analytics](https://pineanalytics.substack.com/p/the-history-of-solana-security-incidents) (n.d., commentary)
- **Delegated signing:** with Privy, any authorisation key set as a wallet signer "can transact funds", and policies are the only limit. — [Privy authenticated signers](https://docs.privy.io/guide/security/authentication/authenticated-signers) (n.d., primary)

### Inferences

- **(b)** A compromise of Sift's authorisation key, or a too-broad policy (e.g. allowing any Jupiter swap, letting an attacker swap into a honeypot as in the GMGN pattern), is enough to drain wallets. Policies must pin the output to the user's own wallet, restrict to sells of a specific mint, and cap amounts.
- **(c)** A compromised keeper cannot change what was signed, but it can submit early (e.g. sell at a loss before the stop is reached), late, or never. Unless the signed transaction itself enforces the price condition (an on-chain min-out or oracle check), "early submission" is a real loss vector. Users trained to sign durable-nonce transactions are also exposed to Drift-style and phishing abuse. Sift's `verifyTradeTransaction` would have to show clearly that a nonce is in use.
- **(d)** Escrow bugs (missing account or signer validation, as in Cashio and Wormhole) are the historical Solana loss pattern. An audit, immutability or a timelocked upgrade, and bounded TVL are needed.
- **(e)** Operator hot keys are the historical source of trading-bot losses (Banana Gun, BONKbot, Unibot, Maestro). Session-token theft (GMGN) shows that the app's auth layer becomes a custody layer.

### Gaps

- No primary GMGN post-mortem. The Unibot and Maestro details are thin.
- No public incident specific to Privy or Turnkey policy bypass was found (not searched in depth).

## 5. User-protection practices from established exchanges for stop orders

### Takeaway

Exchanges present stop orders as a trade-off. A stop-market order executes but at an uncertain price. A stop-limit order protects the price but may not fill if the market gaps. Neither removes gap risk.

### Cited Findings

- Bitvavo: a stop-market order is "an execution certainty order… you do not control the exact execution price". "Stop Limit orders do not guarantee execution, and if the market price moves past the limit too quickly, the order may remain open." — [Bitvavo Help Centre](https://support.bitvavo.com/hc/en/articles/4405191439633) (n.d., primary exchange)
- A wider gap between trigger and limit makes a fill more likely but gives weaker protection. Bots typically close at market. — [Bitsgap blog](https://bitsgap.com/blog/stop-market-vs-stop-limit-why-your-stop-loss-filled-at-a-worse-price) (n.d., vendor/commentary)
- Jupiter's own warning: "Stop Loss is not guaranteed to execute". — [Jupiter Limit Orders](https://docs.jup.ag/user-docs/trade/swap/limit-orders) (n.d., primary)

### Inferences

- Sift should offer stop-limit (a user-set worst price, i.e. min-out) as the default for meme coins. It should warn explicitly that the order may not fill on rugs or freezes, and show minimum received, fees and priority fee before arming. This matches Sift's CLAUDE.md cost-disclosure rule and its "never advise buy/sell" rule.

### Gaps

- Coinbase, Kraken and Binance help pages were not retrieved. No regulator-mandated stop-order disclosure text (e.g. VARA Market Conduct Rulebook) was found.

### Questions for a UAE lawyer (VARA / ADGM / CBUAE)

1. Under the VARA Regulations 2023, Schedule 1 (as amended, Rulebooks v2.0 of June 2025), does "Custody Services" or "controlling" cover (i) a server authorisation key with policy-limited signing power (Privy/Turnkey), (ii) a keeper broadcasting user-pre-signed durable-nonce transactions, (iii) an escrow program for which Sift holds upgrade or admin authority, and (iv) an immutable escrow program?
2. Does executing users' conditional orders (deciding when to submit) amount to Broker-Dealer Services (arranging or executing orders) even when Sift never holds the assets?
3. Does introducing users to Jupiter Trigger V2's "custodial" Privy vaults make Sift an arranger of custody or of brokerage in Dubai?
4. After 16 Sep 2026, does Federal Decree-Law No. 6 of 2025, Art. 62 ("facilitates… by any means… technology"), require CBUAE licensing for non-custodial trading software? Was the transition extended? How do CBUAE, SCA and VARA competences interact for a Dubai mainland or free-zone company?
5. Is there any VARA exemption, sandbox or no-action route for self-custody wallet software, and what is the ADGM FSRA position on "Type 3 non-custodial wallet providers" if Sift relocated to ADGM?
6. What licences or letters do Apple (3.1.5(iii)) and Google Play accept as evidence for a UAE-based non-custodial app, and which storefronts should be excluded?
7. Does serving users outside the UAE (EU, US) from the UAE trigger MiCA reverse-solicitation or FinCEN/state money-transmitter issues for approaches (b)–(e)?
8. What liability, disclosure and complaints obligations apply if a Sift-operated keeper fails to fire, fires early, or is compromised?
