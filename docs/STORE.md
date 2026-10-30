# Shipping Sift to the App Store and Google Play

Everything the store forms ask for, plus the steps to build and submit. Builds run on Expo
(EAS), so no Mac is needed.

## 1. Accounts (yours; Claude can't create these)

| Account             | Cost       | Notes                                                                                                                     |
| ------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| Apple Developer     | $99 / year | Enrol as an **organisation** (needs a free D-U-N-S number). A finance app from a company reviews more smoothly.           |
| Google Play Console | $25 once   | Also as an **organisation**. New personal accounts must run a closed test with 12+ testers for 14 days before production. |
| Expo                | free       | Create an access token (Account settings → Access tokens) and add it to this environment as `EXPO_TOKEN`.                 |

## 2. Before the first submission

- [ ] Licence in place for every country you list the app in (Apple guideline 3.1.5: crypto
      exchange features need the licence where they're offered; Google Play's crypto policy
      asks for registration in several countries).
- [ ] A lawyer has read `/privacy` and `/terms` (served by the API).
- [ ] In Render, set `SUPPORT_EMAIL` and `OPERATOR_NAME` (the company's legal name). They
      appear on `/privacy`, `/terms` and `/support`.
- [ ] Firebase set up for Android push (`apps/mobile/google-services.json`, plus the FCM key
      in Expo credentials).
- [ ] Decide devnet beta or mainnet (see section 7).

## 3. Store listing

**Name:** Sift
**Subtitle (Apple, 30 chars):** Meme coins, checked first
**Short description (Google, 80 chars):** Solana meme coins with a risk check on every token, and friends' trades.
**Category:** Finance
**Age rating:** 17+ (Apple) / Mature or 18+ (Google questionnaire: real-money trading of crypto)

**Description**

> Sift is a Solana meme coin app built around safety and friends.
>
> Every token gets an automatic risk check before you see it: who can mint more, who can
> freeze your tokens, how concentrated the holders are, whether selling works, and the
> creator's history. Each result comes with a plain-language reason, and a short summary
> explains the token in everyday words.
>
> • Discover trending tokens, new pairs and what top traders are buying
> • Candle charts, volume, buys and sells, market cap and recent activity
> • See the full cost before every trade: Sift fee, network fee, slippage and the minimum
> you'll receive. You confirm before anything is signed.
> • Your phone wallet's key stays on your phone. Or connect Phantom.
> • Follow friends and see the trades they choose to share
> • Watchlist and price alerts
>
> Risk checks look for known warning signs; they can't promise a token is harmless. Meme
> coins are extremely risky and most lose most of their value. Sift doesn't give financial
> advice.

**Keywords (Apple, 100 chars):** solana,meme coin,crypto,token,risk,wallet,phantom,trading,charts,alerts

**Links:** privacy `https://sift-api-ggmv.onrender.com/privacy`, support
`https://sift-api-ggmv.onrender.com/support`, terms `https://sift-api-ggmv.onrender.com/terms`.
(Move these to your own domain when you have one.)

**Screenshots:** iPhone 6.9" (1320 × 2868) and 6.5", iPad 13" (Sift supports tablets), Android
phone. Use real app data, or label sample data clearly.

## 4. Privacy answers

Sift has no ads, no analytics, no tracking and no email or phone sign-up.

**Apple "App Privacy"**

| Data type                                                  | Collected | Linked to user | Tracking | Purpose           |
| ---------------------------------------------------------- | --------- | -------------- | -------- | ----------------- |
| Identifiers → User ID (wallet address)                     | Yes       | Yes            | No       | App functionality |
| Identifiers → Device ID (push token)                       | Yes       | Yes            | No       | App functionality |
| User content → Other (profile name, handle)                | Yes       | Yes            | No       | App functionality |
| Financial info → Other (shared trades, Sift wallet orders) | Yes       | Yes            | No       | App functionality |
| Usage data / Diagnostics / Location / Contacts             | No        |                |          |                   |

**Google "Data safety"**

- Collects: user IDs (wallet address), device IDs (push token), name (display name),
  financial info (purchase history: shared trades, orders). All for app functionality,
  none shared with third parties for their own use, none optional to collect except
  profile and sharing.
- Encrypted in transit: yes. Users can request deletion: yes, in the app (Friends → Delete
  account) and via the support page.

**Account deletion (both stores require it):** Friends → Delete account. A Sift wallet must
be emptied first; the server checks on chain.

**Export compliance (Apple):** `ITSAppUsesNonExemptEncryption` is false: Sift only uses
standard encryption (HTTPS, platform key storage, standard signatures).

## 5. Notes for app review

Paste into Apple "App Review Information" and Google "App access":

> Sign-in is with a Solana wallet, not an account. To review: open Portfolio → Create
> wallet. The app makes a wallet on the device; then tap "Get 1 test SOL" (devnet builds) to
> fund it. Trades show the full cost and ask for confirmation before signing. Risk checks
> are on every token page. Delete account: Friends → Delete account.

For a mainnet build, reviewers can't get test SOL: give them a funded demo wallet's
import key in the private review notes (only a small amount), or a TestFlight-only devnet
build.

## 6. Build and submit

Once `EXPO_TOKEN` is set, Claude runs these (or you can, from `apps/mobile`):

```bash
npx eas init                                    # links the project to your Expo account (once)
npx eas build --platform all --profile production
npx eas submit --platform android --profile production   # to the Play internal test track, as a draft
npx eas submit --platform ios --profile production       # to TestFlight
```

The first iOS build asks for your Apple login once to create certificates; Expo stores them.
The first Android build creates the upload key; Expo keeps it (back it up from expo.dev →
Credentials). Then in the consoles: TestFlight → add testers; Play → internal testing →
add testers → later promote to production.

## 7. Turning on real money (mainnet)

Not a store setting: it's the API and the app build. In order:

1. External audit of the signing path, and the licence (see `SECURITY_REVIEW.md`, "Before
   mainnet").
2. A paid mainnet RPC for the phone's checks: `EXPO_PUBLIC_SOLANA_RPC_URL`.
3. Render: `SOLANA_CLUSTER=mainnet-beta`, `ALLOW_MAINNET_TRADING=true`; real fee wallet.
4. Consider launching mainnet with phone/Phantom trades first and the Sift wallet (custodial)
   after its own review.
5. A new store build with `EXPO_PUBLIC_SOLANA_RPC_URL` set. No code change: the app reads
   the network from the API (`useNetwork()` in `apps/mobile/src/lib/network.ts`), so the
   DEVNET tags, "test SOL" wording and devnet Solscan links switch off by themselves.

## 8. Store images (ready)

All in `apps/mobile/store/`, made at the exact sizes the stores ask for (sample coins, shown
the way a mainnet build looks):

| File                             | For                           |
| -------------------------------- | ----------------------------- |
| `iphone-6.9-*.png` (1320 × 2868) | App Store, iPhone 6.9"        |
| `iphone-6.5-*.png` (1284 × 2778) | App Store, iPhone 6.5"        |
| `ipad-13-*.png` (2064 × 2752)    | App Store, iPad 13"           |
| `android-*.png` (1080 × 2160)    | Google Play phone screenshots |
| `play-feature-1024x500.png`      | Google Play feature graphic   |
| `play-icon-512.png`              | Google Play app icon          |

## 9. Website

`apps/site/` is the landing page (plain HTML, no scripts). `render.yaml` adds it as the
static site `sift-site`. In Render, open the Blueprint and click **Sync** (or Manual sync) to
create it; after that it redeploys on every push. To use your own domain: Render → sift-site
→ Settings → Custom domains, then point your DNS there. When the store links exist, replace
the two "coming soon" buttons in `apps/site/index.html` with them.
