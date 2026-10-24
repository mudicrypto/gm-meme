# Delegated / session signing for embedded wallets on Solana (for server-fired limit and stop-loss orders, while staying non-custodial)

All sources accessed 2026-10-24 unless noted. Vendor docs are undated living pages; "as of 2026-10-24" means "what the page said on that day". Access notes: docs.privy.io was unreachable through WebFetch (DNS), so its pages were read as raw `.md` via curl. The Turnkey docs were read from `https://docs.turnkey.com/llms-full.txt`, the official full-docs dump, and each finding cites the per-page `Source:` URL listed there. GitHub API access to the Swig, Squads and Lazorkit repos was blocked in this session, so those findings come from their docs sites and raw READMEs.

## Privy: signers, policy engine, key storage, RN SDK, pricing, import, ownership

### Takeaway

Privy natively supports the exact use case: the user adds a "signer" (an app-held P-256 authorization key, organised as a key quorum) to their embedded Solana wallet, optionally scoped by a policy. Privy's docs name "execute limit orders ... while a user is offline" as a use case. Policies are enforced inside AWS Nitro TEEs, default-deny, and evaluated per Solana instruction. Sift's existing seed can be imported, but the key then lives in Privy's TEE/Shamir-shard system rather than only on the phone, so this is a key-custody migration, not an add-on.

### Cited Findings

- **Signers**: apps "add signers to wallets that can take actions within the scope of certain permissions". The docs list "Offline actions: execute limit orders or agentic trades even while a user is offline" as a use case. "A signer will never see the wallet's private key. All signing takes place in a secure enclave that only your application can make authorized requests to." — [Privy signers overview](https://docs.privy.io/wallets/using-wallets/signers/overview.md)
- **Setup flow**: the app generates a P-256 key (`openssl ecparam -name prime256v1`), registers the public key as a 1-of-1 "key quorum", and its server then signs API requests with the private key to authorize transactions from user wallets. "Privy does not store your private key." An optional policy per signer can expire the signer's permissions after a date, or allow only transactions under an amount with a specific contract "in order to execute a limit order when a user is offline". The recipe includes React Native (Expo) setup. — [Privy recipe: user and server signers](https://docs.privy.io/recipes/wallets/user-and-server-signers.md)
- **Adding a signer**: `addSigners({address, signers:[{signerId, policyIds}]})` from the `useSigners` hook exists for React, React Native, Swift and Android. "policyIds ... optional ... if not provided, no policies will apply to the signers requests". "at this time, each signer can only have one override policy." — [Privy add signers](https://docs.privy.io/wallets/using-wallets/signers/add-signers.md)
- **Revocation**: `removeSigners({address})` (React and React Native) "will remove all the signers, so only the user can transact on the wallet". This is user-initiated revocation of consent. — [Privy remove signers](https://docs.privy.io/wallets/using-wallets/signers/remove-signers.md)
- **Policy engine**:
  - Supports transfer limits, time-bound signers, recipient allowlists and denylists, "smart contracts and programs" allowlists and denylists, network lists, a time window for key export, and calldata/parameter constraints.
  - `DENY` takes precedence, and a request that matches no rule is denied. A method with no rule in the policy is denied.
  - "every Instruction in a Solana transaction is evaluated against the rules of the policy. Every instruction must evaluate to an ALLOW action."
  - Policies are enforced in the TEE "before signing or exporting key material".
  - Solana field sources are `solana_program_instruction`, `solana_instruction_data`, `solana_system_program_instruction` and `solana_token_program_instruction`.
  - For sign-and-send, simulation runs before policy evaluation.

  — [Privy policies overview](https://docs.privy.io/controls/policies/overview.md)

- **Solana example policies**: allowlist programs by `programId`, cap `Transfer.lamports`, cap `TransferChecked.amount` for a given `TransferChecked.mint` (USDC), denylist recipients, and set time windows. — [Privy Solana example policies](https://docs.privy.io/controls/policies/example-policies/solana.md)
- **Time-bound rule**: uses `field_source: 'system', field: 'current_unix_timestamp', operator: 'lt'`. The page's example is "Allow all actions before 9/8/2026". — [Privy time-bound examples](https://docs.privy.io/controls/policies/example-policies/timebound.md)
- **Key storage**:
  - TEEs are AWS Nitro Enclaves, and keys are split with Shamir secret sharing into a 2-of-2 set: an "enclave share" sealed to the TEE and an "auth share" that Privy encrypts and stores and releases "only with valid authentication credentials, e.g. a bearer token or secret".
  - The key is reconstructed only in the enclave during signing.
  - Wallets are BIP-39 HD wallets, created from 128-bit entropy inside the TEE.

  — [Privy security architecture](https://docs.privy.io/security/wallet-infrastructure/architecture.md)

- **Enclave controls**: authorization signatures and policies are verified inside the enclave before signing. Privy claims "Privy team members cannot reconstruct keys or bypass policy checks". Customer-verifiable attestation documents are marked "Coming soon" (not available as of 2026-10-24). — [Privy secure enclaves](https://docs.privy.io/security/wallet-infrastructure/secure-enclaves.md)
- **Custody claim**: "Privy never stores a complete private key". The auth share "is encrypted at rest and released only when the user authenticates". — [Privy security FAQ](https://docs.privy.io/security/security-faqs.md)
- **Deprecated "delegated actions"**: the older `useDelegatedActions` / `useHeadlessDelegatedActions().delegateWallet` interface is superseded by session signers ("use the `useSessionSigner` hook instead of the previous `useDelegatedActions` hook"). Migrating from on-device execution to TEE execution "will reset all delegations". Only TEE-migrated wallets support server-side features. Migration is one-way. — [Privy TEE migration guide](https://docs.privy.io/recipes/tee-wallet-migration-guide.md)
- **Key import**: "Privy enables you to import wallet private keys". On Solana the key is "base58-encoded private key". The Expo SDK has `useImportWallet().importWallet({privateKey, chainType:'solana', additionalSigners})`. `additionalSigners` (session signers at import time) is "Only supported for TEE wallets". — [Privy import private key](https://docs.privy.io/wallets/wallets/import-a-wallet/private-key.md)
- **Pricing (as of 2026-10-24)**:
  - Free tier covers up to 500 MAU and includes "50K signatures and $1M transaction volume for free every month".
  - Core is $299/month for 500 to 2,499 MAU. Scale is $499/month for 2,500 to 9,999 MAU.
  - Enterprise has custom pricing, "as low as $0.001/signature".
  - The comparison matrix lists "Delegated access to wallets" and "Policy engine".

  — [Privy pricing](https://www.privy.io/pricing)

- **Ownership**: Stripe announced it was acquiring Privy in June 2025, and Privy said it would stay an "independent product" under Stripe — [Blockworks](https://blockworks.co/news/stripe-acquires-privy-wallet); [The Paypers](https://thepaypers.com/fintech/news/stripe-to-acquire-privy-to-further-scale-web3-capabilities). Contemporary reports said closing was expected "in the upcoming weeks" (citing CoinDesk, June 2025) — [The Middle Market](https://www.themiddlemarket.com/latest-news/stripe-acquires-crypto-wallet-firm-privy).

### Inferences

- A compromised Sift server holding the Privy authorization key could make any request the signer's policy allows, until the policy expires or the user removes the signer. Two things bound the damage: the policy, enforced in Privy's TEE rather than on Sift's server, and whether Privy's own auth path is also compromised.
- A program allowlist (Jupiter, Token, ATA, Compute Budget) does not by itself stop a malicious swap. For example, it would not stop a swap routed to a junk mint or at extreme slippage, or a Jupiter route whose output token account is not the user's. Tight policies need account-level and amount conditions (`solana_instruction_data`, token-program fields), and those are hard to express for Jupiter routes. This is my inference from the field sources listed. I found no Privy example of a Jupiter-swap-only policy.
- Importing Sift's seed moves custody of key material into Privy's 2-of-2 shard model. The phone would no longer be the only holder. That changes Sift's "seed only in secure storage" property, and the user-facing explanation would have to change with it.

### Gaps

- Per-signature latency of Privy server-side signing: no figure found.
- Whether Privy can constrain Jupiter route accounts (e.g. require the destination token account to be owned by the wallet). Not confirmed in the docs I read.
- Whether the Stripe acquisition formally closed (date): not confirmed by a primary source.
- Policy-engine audits or third-party reviews: not found.

## Turnkey: Solana, sub-orgs, policies, delegated access, enclaves, RN SDK, pricing, import, customers

### Takeaway

Turnkey offers "Delegated Access": a non-root, API-key-only user inside each end-user's sub-organization, with policies that restrict what it can sign. Its docs name "limit orders" explicitly. The policy language parses Solana transactions deeply: programs, accounts, SOL and SPL transfers, IDL-parsed instructions, and V1 priority fees. Everything security-critical runs in AWS Nitro enclaves on QuorumOS. Raw keys can be imported, including from React Native. Turnkey's customer pages confirm Axiom and Moonshot as customers.

### Cited Findings

- **Delegated Access**: "creating a specialized business-controlled user within each end-user's sub-organization that has carefully scoped permissions". Example uses: "Automate onchain actions such as staking, redemptions, or limit orders" and "Sign transactions to whitelisted addresses without user involvement". — [Turnkey delegated access overview](https://docs.turnkey.com/features/policies/delegated-access/overview)
- **Frontend setup (recommended)**: uses the end-user's authenticated session to create the API-only Delegated User as non-root, with `fetchOrCreateP256ApiKeyUser` and `fetchOrCreatePolicies`. "There's no possibility of elevated (root-level) access for the delegated user." — [Turnkey delegated access overview](https://docs.turnkey.com/features/policies/delegated-access/overview)
- **Backend setup (caution)**: the delegated user is temporarily in the root quorum "without direct end-user consent". If the quorum update fails, it "may unintentionally retain root privileges, effectively gaining unrestricted access". A delegated user that is granted policy-creation permission could widen its own access unless further policies restrict it. — [Turnkey delegated access overview](https://docs.turnkey.com/features/policies/delegated-access/overview); [Turnkey backend setup](https://docs.turnkey.com/features/policies/delegated-access/backend)
- **Solana policy language**: `solana.tx` exposes:
  - `account_keys`, `instructions[].program_key`, `accounts`, `instruction_data_hex` and address table lookups
  - `parsed_instruction_data`, when an IDL has been uploaded
  - `transfers` (SOL; only direct System Program calls) and `spl_transfers` (only top-level `Transfer`, `TransferChecked`, `TransferCheckedWithFee`), with `token_mint`, `owner` and `amount`
  - V1 `priority_fee_lamports`

  Transfers performed inside other programs are "not included". — [Turnkey policy language](https://docs.turnkey.com/features/policies/language)

- **Solana policy examples**: IDL-specific program instruction allowlists, transfer caps per sender and recipient, caps on V1 priority fees and compute limits, and sponsored-transaction caveats. Example: "An absent V1 priority fee reads as zero, but sponsorship can fill a nonzero fee later". — [Turnkey Solana policy examples](https://docs.turnkey.com/features/policies/examples/solana)
- **Enclaves**: "all security-critical Turnkey services — including key generation, signing, and our policy engine — are deployed in secure enclaves". These run on AWS Nitro (Nitro Security Module) under Turnkey's enclave OS, QuorumOS (QOS). — [Turnkey secure enclaves](https://docs.turnkey.com/security/secure-enclaves.md)
- **Import**: works through a target encryption key (TEK) generated in the enclave and signed by the enclave quorum key. The client encrypts the mnemonic or private key before it leaves the device. "Neither Turnkey nor your application ever sees the plaintext." Client guides exist for React, React Native, Flutter, Swift and Kotlin. — [Turnkey import wallets](https://docs.turnkey.com/features/wallets/import-wallets)
- **React Native**: a React Native Wallet Kit exists, with `fetchOrCreatePolicies`, `createPasskey`, `addPasskey`, `createApiKeyPair` and sessions. Generated reference: e.g. [RN wallet kit fetchOrCreatePolicies](https://docs.turnkey.com/generated-docs/react-native-wallet-kit/client-context-type-fetch-or-create-policies). Authentication options are email, passkey and social, per [Turnkey llms.txt](https://docs.turnkey.com/llms.txt).
- **Pricing (as of 2026-10-24)**:
  - Pay as You Go: $0.10/signature after 25 free per month, up to 1k wallets, policies "Up to 5 per org".
  - Pro: $99/month and $0.05/signature, 2k wallets.
  - Enterprise: as low as $0.0015/signature, unlimited wallets, up to 250 policies per org.
  - Import and export of keys are included on all tiers.

  — [Turnkey pricing](https://www.turnkey.com/pricing)

- **Axiom case study**: claims 1M+ user wallets, 100K+ users onboarded per month, and "$100M+ in platform revenue within 100 days of implementation". The CTO says Turnkey's "flexible policy engine" and non-custodial status were key. — [Turnkey x Axiom case study](https://www.turnkey.com/customers/axiom-global-defi-trading-platform)
- **Moonshot** is also listed as a Turnkey customer ("millions of self-custodial wallets"). — [Turnkey docs customer list](https://docs.turnkey.com/llms-full.txt) linking to [Moonshot case study](https://www.turnkey.com/customers/how-moonshot-powers-millions-of-self-custodial-wallets-using-turnkey)

### Inferences

- Under Turnkey, a compromised Sift server holds the Delegated User's API key. It can sign anything the sub-org policies allow, but it cannot change the root quorum if the frontend flow was used. Revocation means the end-user (root) deleting the delegated user or its policies.
- Turnkey's Solana policy language can express "only Jupiter program and SPL transfers whose owner is the wallet". It is the most expressive of the off-chain engines I reviewed, but CPI-level token movements inside Jupiter are not visible to `spl_transfers`.
- The policy cap of 5 on lower tiers implies Sift would need Enterprise (up to 250 per org), or one shared policy template per sub-org. Unverified whether the limit is per parent org or per sub-org.

### Gaps

- Signing latency at trigger time: no published number found.
- Revocation API specifics from React Native, e.g. deleting the delegated user from the phone: not read in detail.
- Turnkey audits and whitepaper dates were not checked in this pass.

## Other embedded-wallet vendors (brief): Dynamic, Para, Coinbase CDP, Crossmint, Web3Auth

### Takeaway

Every vendor except possibly Web3Auth offers some form of server signing on Solana. Policy depth and the custody model differ a lot. Dynamic and CDP have explicit user-granted delegation for Solana. Crossmint's model is smart-wallet signers. Para has a server-enforced permissions engine.

### Cited Findings

- **Dynamic**:
  - Delegated Access gives the developer "a cryptographic share and a per-wallet API key" through an MPC reshare ceremony that the user approves.
  - Encrypted shares arrive by webhook (`wallet.delegation.created` / `revoked`).
  - Supported chains include Solana.
  - Production use "requires an Enterprise plan".

  — [Dynamic delegated access](https://www.dynamic.xyz/docs/embedded-wallets/mpc/delegated-access/overview.md)

- **Dynamic policies**: cover EVM, Solana, Stellar, Bitcoin and Sui, and are "created and enforced in a trusted execution environment", with pre-signing enforcement. For Solana, the engine resolves token accounts and auto-excludes standard programs (Token, Token-2022, ATA, Memo) for their safe instructions. — [Dynamic policies](https://www.dynamic.xyz/docs/embedded-wallets/mpc/policies/overview.md)
- **Coinbase CDP**:
  - "Delegated signing lets your backend sign transactions on behalf of end users without requiring them to be online". The user calls `createDelegation({expiresAt})`, which is time-bound.
  - Scopes are user-scoped or account-scoped, and the delegation can be revoked by the user or the developer.
  - Solana methods are `signSolanaTransaction`, `sendSolanaTransaction` and `sendSolanaAsset`.

  — [CDP delegated signing](https://docs.cdp.coinbase.com/wallets/using-wallets/delegated-signing.md). The CDP docs also list a policy engine ([CDP security & policies](https://docs.cdp.coinbase.com/wallets/security-and-policies/overview.md)), but I did not verify whether its Solana rules apply to delegated signing.

- **Crossmint**: offers a "Server Signer" whose secret "Remains on your server and is never transmitted to Crossmint". It "can grant full si[gning]" authority. Signing is in-process (lowest latency). Wallets are smart wallets on EVM, Solana and Stellar. — [Crossmint server signer](https://docs.crossmint.com/wallets/guides/signers/server-signer.md); [Crossmint llms.txt](https://docs.crossmint.com/llms.txt)
- **Para**: a policy is "a set of rules that Para checks every time a wallet it covers is asked to sign. Para runs the check on its own servers". It supports caps, recipient, token and contract limits, approvals, and user-accepted "Requests". — [Para permissions](https://docs.getpara.com/v3/concepts/permissions.md). Para has also partnered with Swig for Solana smart accounts — [Para blog](https://blog.getpara.com/solana-smart-accounts/).
- **Web3Auth**: now under MetaMask Embedded Wallets. Its docs mention "Advanced Permissions" for MetaMask users (EVM context). — [Web3Auth docs](https://web3auth.io/docs/llms.txt)

### Inferences

- A Dynamic delegation hands the developer an actual MPC key share plus an API key. That gives Sift more raw capability than Privy or Turnkey's API-key signers, so policies enforced by Dynamic's TEE are the only bound.
- A Crossmint server signer is effectively a full-authority operational key unless the smart-wallet configuration restricts it. That is a poor fit for "only what the user approved".

### Gaps

- Para's Solana program and instruction-level coverage was not confirmed: the permissions reference grep showed no "solana" match. Unknown.
- Web3Auth/MetaMask Embedded Wallets: no Solana policy-scoped delegated signing found.
- Pricing for Dynamic delegated access (Enterprise only), CDP and Crossmint: not gathered.

## Program-enforced session keys / smart accounts on Solana (Swig, Squads, Lazorkit) and whether a plain Phantom/MWA account can grant session keys

### Takeaway

On-chain options move the permission check into a Solana program. A compromised Sift server is then bound by on-chain rules rather than by a vendor's TEE, and Sift's existing ed25519 key can stay on the phone as root authority. The catch is that funds must live in a program-owned smart-account address, not the user's current address.

- **Swig (Anagram)**: the most complete option. It has roles, 18 permission actions, sessions with expiry, sub-accounts, an Accretion audit (2025) and an Expo SDK.
- **Squads Smart Account Program**: v0.1, deployed on mainnet with policies and spending limits.
- **Lazorkit**: explicitly pre-audit.

A normal ed25519 wallet (Phantom/MWA) has no native session-key mechanism.

### Cited Findings

- **Swig sessions**: `CreateSessionV1` loads a role, checks that the authority type supports sessions, authenticates the base authority, and "stores a session key and expiration window". Later execution authenticates via the session until expiry. Session-capable authorities are Ed25519, Secp256k1, Secp256r1 and ProgramExec. "Sessions keep the existing permission model." Sub-accounts give a role "a separate balance bucket" that can be toggled off. — [Swig sessions and sub-accounts](https://build.onswig.com/protocol/sessions-and-subaccounts.md)
- **Swig permissions**:
  - A role is one authority plus an `actions` list, with 18 actions in TS SDK `0.10.0`.
  - Actions include `all`, `allButManageAuthority`, `manageAuthority`, `solLimit` and recurring SOL/token limits with slot-based windows, plus destination limits and `program` / `programAll` / `programCurated`.
  - "Program access and asset spending are checked separately ... Granting `program` ... alone does not grant an unlimited SOL or token allowance."

  — [Swig permissions](https://build.onswig.com/developer-sdk/permissions.md)

- **Swig design**: the policy engine is on-chain, with no TEE dependency, and up to 65,000 roles per wallet. Third-party summary: [Solana Compass, Swig at Breakpoint 25](https://solanacompass.com/learn/breakpoint-25/swig-the-future-of-smart-wallets-on-solana).
- **Swig audit**: "2025 Accretion Swig Audit". The docs say it is "one input, not the whole protocol spec" and that additional audits for the SDK, IDP and portal "should be listed separately" (none listed). — [Swig security & audits](https://build.onswig.com/protocol/security-and-audits.md)
- **Swig mobile**: the Expo/RN IDP SDK (`SwigIdpProvider`, `useSwigIdp`) runs OAuth/OTP through an `expo-web-browser` system auth session, persists sessions in `expo-secure-store`, and its "default network is devnet". — [Swig Expo and React Native](https://build.onswig.com/idp-sdk/expo-and-react-native.md)
- **Squads Smart Account Program v0.1**: "in active development". It offers rent-free wallet creation, "Atomic policy enforcement and transaction execution", and custom policy programs. It is deployed at `SMRTzfY6DfH5ik3TKiyLFfXexV8uSG3d2UksSCYdunG` on mainnet-beta and devnet, verifiable with Ellipsis Labs' tool. — [Squads smart-account-program README](https://raw.githubusercontent.com/Squads-Protocol/smart-account-program/main/README.md)
- **Squads spending limits**: Squads' API describes token-specific allowances with periodic resets and destination restrictions. Spending-limit debits bypass the threshold and the time lock. — [Squads API v1 intro](https://developers.squads.so/squads-api/api-reference/v1/introduction)
- **Squads audits found**: Trail of Bits and Neodyme audits cover Multisig v4, including spending limits, in 2023. I found no audit specifically for the Smart Account program. — [Squads: Trail of Bits audit v4](https://squads.so/blog/trail-of-bits-security-audit-v4); [Neodyme v4 report](https://www.neodyme.io/reports/Squads-Multisig-v4.pdf)
- **Squads v5 roadmap**: describes granular key permissions as planned. — [Squads Protocol v5](https://squads.so/blog/squads-protocol-v5)
- **Lazorkit**: "Passkey-native smart wallets on Solana ... on-chain RBAC + spending limits". The README warns: "CAUTION: Pre-audit. Do not use in production." It has an RN/Expo package, `@lazorkit/wallet-mobile-adapter`. — [Lazorkit README](https://raw.githubusercontent.com/lazor-kit/lazor-kit/main/README.md)
- **Phantom/MWA and generic session keys**: the Solana cookbook describes session keys as "ephemeral (short lived) keypairs with fine-grained program/instruction scoping" that "need some extra work to implement in the onchain program" (MagicBlock's session-keys crate). It also says some wallets offer "auto approve" via burner wallets. — [Solana cookbook: auto-approve](https://solana.com/pt/developers/guides/advanced/auto-approve)

### Inferences

- A plain ed25519 system account (the user's Phantom/MWA address, or Sift's current embedded address) has a single authority: its key. Solana has no account-level delegation, so session keys need either a smart account (Swig/Squads) or a program that enforces them. This is my reading of the cookbook statement plus the Solana account model. I found no Phantom developer doc offering session keys or server delegation, and it is unverified that none exists.
- The one native partial delegation is SPL Token `Approve`, which lets a delegate move up to N tokens from one token account. A purpose-built on-chain order program could use it so that a Phantom user pre-approves a stop-loss sell of a specific token amount. I could not fetch a primary SPL-token doc passage on this in this session, so treat it as unverified.
- **Fit of Swig for Sift**: the current ed25519 seed becomes the Swig root authority (Ed25519 authority type), so no key import and no vendor custody. The server gets a role, or a session with an expiry, limited to `program` = Jupiter plus token limits.
  - Migration: user funds and the trading address move to the Swig wallet PDA.
  - A compromised server is bound by on-chain limits, but the same Jupiter-route caveat applies: program access plus spend limits do not guarantee a fair swap price or the output destination.
  - Revocation is an on-chain root-signed transaction (remove the role). It costs a transaction fee but no vendor dependency.
- Under the CLAUDE.md rules, any smart-account execute instruction would need explicit additions to `verifyTradeTransaction`'s allow-list, with tamper tests.

### Gaps

- Swig audit findings and dates in detail: the PDF was not read.
- Swig and Squads compute-unit cost and fees per delegated execute: not found.
- Squads "Grid" product details: not researched in this pass.
- Whether Phantom's embedded or "Phantom Connect" SDK now offers delegated or session signing in 2026: not verified.

## Fit for Sift: migration vs import, compromised-server blast radius, revocation, latency/cost

### Takeaway

There are three architectures:

- **Vendor TEE signer** (Privy or Turnkey): import Sift's seed, and the vendor enforces policies.
- **On-chain smart account** (Swig): keep the seed on the phone as root, move funds to the PDA, and the chain enforces policies.
- **Purpose-built escrow or delegate program**: only for specific orders.

In every design, the server can only do what the policy permits. Off-chain engines are more expressive but trust the vendor. On-chain rules trust only audited code, but they cost a migration and on-chain fees.

### Cited Findings

- **Privy import**: supports Solana base58 key import from Expo, with signers attached at import (TEE only) — [Privy import](https://docs.privy.io/wallets/wallets/import-a-wallet/private-key.md).
- **Turnkey import**: supports import from React Native via an enclave-encrypted TEK — [Turnkey import](https://docs.turnkey.com/features/wallets/import-wallets).
- **Revocation**:
  - Privy: `removeSigners` (user).
  - CDP: the delegation can be revoked by the user or the developer, or it expires.
  - Dynamic: `wallet.delegation.revoked` webhook.
  - Swig: root authority removes the role, or the session expires.

  — [Privy remove signers](https://docs.privy.io/wallets/using-wallets/signers/remove-signers.md); [CDP delegated signing](https://docs.cdp.coinbase.com/wallets/using-wallets/delegated-signing.md); [Dynamic delegated access](https://www.dynamic.xyz/docs/embedded-wallets/mpc/delegated-access/overview.md); [Swig sessions](https://build.onswig.com/protocol/sessions-and-subaccounts.md)

- **Per-signature cost (as of 2026-10-24)**:
  - Privy: 50K free signatures/month on the free tier, Enterprise from $0.001.
  - Turnkey: $0.10, $0.05, or from $0.0015.

  — [Privy pricing](https://www.privy.io/pricing); [Turnkey pricing](https://www.turnkey.com/pricing)

- **Latency claims**: Crossmint's server signer signs "entirely in-process with no external network call, making this the lowest-latency option" — [Crossmint server signer](https://docs.crossmint.com/wallets/guides/signers/server-signer.md).

### Inferences

- **Blast radius of a compromised Sift server**:
  - Privy or Turnkey: everything the per-user policy allows, until expiry or revocation. With program allowlist plus amount caps, the worst case is draining via adversarial swaps within caps. An expiry bounds the duration.
  - Dynamic: also holds an MPC share, which is more sensitive.
  - Crossmint server signer: potentially full authority.
  - Swig: on-chain role limits. Root and authority management stay with the phone key.
- **Latency at trigger time**:
  - Vendor TEE signers add one HTTPS round trip to the vendor. Turnkey's activity model also requires API-key request stamping. No figures are published.
  - On-chain smart accounts add instruction overhead (CU, possibly ALTs) but no extra network hop if the server holds a session key.
  - Both are dominated by Jupiter quote and landing time.
- **Non-custodial compliance with CLAUDE.md**: all designs keep the server away from raw seeds. Vendor designs, however, move the user's key out of phone-only storage, which the product docs would need to say clearly. Swig preserves "key only on device" for the root key. The server holds a session or role key that is limited by design.
- Phantom/MWA users cannot delegate. For them, stop-losses that fire while offline would need an escrow or on-chain order program (e.g. a Jupiter Trigger-style order account) or SPL `Approve`. Otherwise they cannot be supported. Inference; not verified here.

### Gaps

- No published end-to-end latency or benchmark for Privy, Turnkey or Swig signing.
- Whether any vendor policy can enforce "minimum output amount ≥ X" on a Jupiter swap. This is the key safety property for stop-losses, and I did not confirm it for any vendor.
- Legal analysis of "non-custodial" status when the server holds a delegated signer: out of scope; not researched.
