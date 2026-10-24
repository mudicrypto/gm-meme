# Sift — Design hand-off for Claude Code

This folder is the approved visual design for the Sift mobile app. Rebuild the Expo app's UI to match it.

- `screens/*.dc.html` are the mockups, one file per screen (390×844 phone frame). Each file is HTML with **inline styles that hold the exact colours, sizes, spacing and copy**. Read them as the source of truth for layout and text. The `<script>` block at the bottom of each file holds the sample data and small interactions (tab selection, switches).
- They are mockups, not code to copy: rebuild them as React Native components using the shared theme below.
- All numbers, token names and friend names are **sample data**. Use real data from the API.

**Rules for this work**
1. Do not change any trading, signing, price-check or security logic while restyling. UI only, until the "New features" section.
2. Build a theme file first (`packages/shared` or `apps/mobile/theme.ts`) and use it everywhere. No hard-coded colours in screens.
3. Show me screenshots of each screen before committing.
4. Everything stays on devnet.

---

## 1. Design system

**Look:** dark, calm, premium fintech. Flat surfaces, no gradients, no emoji, no confetti.

### Colours
| Token | Hex | Use |
|---|---|---|
| bg | `#0B0D12` | Screen background |
| surface | `#151922` | Cards, inputs, sheets |
| surface2 | `#1D2230` | Nested cards, secondary buttons |
| border | `#1F2430` / `#262C3A` | Card borders / button & input borders |
| text | `#F3F5F9` | Primary text |
| text2 | `#C9CFDA` | Body on cards |
| muted | `#9BA4B5` | Secondary labels |
| faint | `#8A93A5` | Captions, disclaimers |
| accent | `#8B9CFF` | Primary buttons, active tab, selected chips (text on it: `#0B0D12`) |
| accentText | `#A9B5FF` | Links, accent labels |
| safe / up | `#34D399` | Safe badge, gains |
| caution | `#FBBF24` | Caution badge, DEVNET badge |
| danger / down | `#F87171` | Risky badge, losses, stop loss |

Tinted backgrounds = the colour at 12–16% opacity (e.g. safe badge bg `rgba(52,211,153,0.12)`); tinted borders at ~25–35%.

### Type
- UI font: **Manrope** (400–800). Numbers, prices, amounts, addresses: **JetBrains Mono** (500–600).
- Screen title 28/800, letter-spacing −0.8. Section title 17/800. Card title 15–16/700. Body 14. Labels 12–13. Captions 11–12.
- Big numbers (balance, price): 36–52, mono, letter-spacing −1 to −2.

### Shape & spacing
- Screen side padding 20. Gaps between cards 10. Card padding 14–16.
- Radius: cards 18–20, big cards 24, buttons 16 (primary 54–56 tall), chips/inputs 12–14, badges pill (999).
- Touch targets ≥ 44. Icon buttons 44×44, radius 14, surface bg + border.
- Icons: simple 2px stroke line icons (lucide-style). Never emoji.

### Components
- **Risk badge** (the hero of every token): pill, dot + label. Safe / Caution / Risky in the three status colours. Always text + colour, never colour alone.
- **Token card**: avatar (44, radius 14, initials) · name + symbol · age + market cap (mono) · price + change (mono, green/red) · second row: risk badge + one-line reason.
- **Bottom tab bar**: Discover · Friends · Watchlist · Portfolio. Active = accent colour.
- **Switch**: 48×28 track, accent when on.
- **Bottom sheet**: radius 28 top, surface bg, grab handle, dimmed background.
- **DEVNET badge**: caution-tinted pill, shown on trade and portfolio screens while on devnet.

### Motion & haptics
- Screen transitions 220 ms ease-out slide, no bounce.
- Price changes: number rolls to the new value (300 ms); a green/red flash that fades in 600 ms.
- Risk badge fades in when the check finishes; a light haptic only when a token turns red.
- Buy/Sell confirm: one firm haptic + checkmark. No confetti, no sounds.
- Skeleton cards while loading; calm pull-to-refresh.
- Respect the phone's Reduce Motion setting.

---

## 2. Screens (restyle existing ones)

| File | Screen | Key points |
|---|---|---|
| `Main.dc.html` | Discover | Header (logo, search, bell → Alerts). Tabs New / Trending / Safest. "Safety filter on · N red tokens hidden · Show" bar. Token cards. |
| `Token.dc.html` | Token detail | Big price + change. Line chart with 5M/1H/6H/24H/All. **Safety check card**: verdict + "5 of 6 checks passed" + grid of checks (✓ green / ! amber). **"In plain words"** AI summary card. Sticky Sell / Buy buttons + "Not financial advice" line. |
| `Trade.dc.html` | Review buy | Big amount input in SOL, "You get ≈". Chips 0.1 / 0.5 / 1 / Max. Full-cost card (fee, priority fee, account deposit, max price move, minimum received, total). "Price checked on Solana" bar. **"Protect this trade"** switch (see 3). "Paying from Sift wallet" line + Confirm button. |
| `Portfolio.dc.html` | Portfolio | Total value + today's change. Deposit / Send / Tax report. **"N scams avoided this month"** card → Recap. Holdings list with risk dots. |
| `Feed.dc.html` | Friends | Friend avatars row (ring = active today). Trade posts: who, buy/sell badge, token mini-card with risk badge, their note, like/comment. |

## 3. New features (build after the restyle)

### Watchlist + price alerts — `Watchlist.dc.html`
Watchlist cards show their alert ("Alert: above $X"). If a token's risk rating worsens, show an amber "Risk changed to Caution · reason" strip. "Set alert" bottom sheet: Goes above / Drops below, price input, switches for "Safety rating changes" and "A friend buys or sells it".

### Alerts inbox — `Alerts.dc.html`
Filters All / Price / Friends / Safety. "Weekly recap is ready" card at top. Items: price alert hit, friend trade, risk changed (amber), "Sift hid X" (green, good news). Quiet hours bar at the bottom (default 23:00–08:00).

### Weekly recap — `Recap.dc.html` (taller scrolling screen)
Net result + 7-day up/down bar chart. Stats: trades, winning trades, best call, **worst call** (show losses as clearly as wins). "N scams avoided" card listing red-flagged tokens the user skipped and how far they fell. "Lesson of the week" (one generated sentence). "Time in Sift this week" + "Set a limit". Share / Done.

### Sift wallet + auto-trading (GMGN-style, decided)
**Architecture change (decided by the founder):** Sift moves to a **custodial "Sift wallet"**, like GMGN, so orders and protection run even when the phone is off. Differences from GMGN that make Sift more trustworthy: users **can export their private key**, and they can **optionally connect Phantom**.

**Wallet model:**
- A Sift wallet is created automatically at sign-up. No Phantom needed. It is the default wallet for all trades.
- Sift's server signs trades and orders from it.
- Keys live in an **MPC/HSM signing service** (compare Turnkey, Privy server wallets, Fireblocks). Never in our database, logs, env files or the app.
- **Export private key**: allowed, behind 2FA and a clear warning screen.
- **Connect Phantom**: optional, for manual phone-signed trades. Auto orders always run from the Sift wallet. Keep the existing phone-side price check for Phantom trades.
- **Withdrawals**: 2FA code, saved withdrawal address, 24-hour wait when the address or 2FA changes.
- **Signing policies**: per-order and daily caps, rate limits, alerts on unusual activity, an emergency "freeze all signing" switch.
- `AutoWallet.dc.html` = the **Wallet & security** screen (wallet card, withdrawal protection rows, Export private key, Connect Phantom, honest custody note).

**Beginner flow (Simple mode):**
1. Buy screen: "Paying from Sift wallet". "Protect this trade" switch, **on by default**: auto-sell if price falls 30%, sell half when it doubles. "Customize" opens the Pro order screen.
2. Confirm → done. No extra steps, no order tabs, no jargon.

**Pro mode:** `Order.dc.html` — PRO badge; tabs Market / Limit / Stop loss / Take profit; trigger price + quick % chips; amount 25–100%; trailing switch; expiry; plain-language summary of exactly what will happen ("in a sudden crash it can fill lower"). `Orders.dc.html` — Sift wallet balance (Add funds / Withdraw), open orders with a progress bar to trigger, Edit / Cancel, Filled tab.

**Process:** this replaces the current phone-signed model, so it is a big change. First write a proposal: signing provider choice, key and policy design, order engine (price monitoring, execution, retries, slippage), migration of existing test users, threat model and monthly cost. Wait for approval before coding. **Devnet only until an external security audit and a custody licence (e.g. VARA in the UAE).**

### Healthy-engagement rules
No streaks, countdowns or "last chance" banners. No leaderboard ranked by profit. Quiet hours on by default. Notifications only for: alerts the user set, friend trades, safety changes, the weekly recap.

---

## 4. Beginner wording fixes (apply across screens)
- In Simple mode, collapse the cost card to **"Total: X SOL (fees included)"** + "See breakdown".
- Show fiat next to SOL amounts ("0.5 SOL ≈ $72").
- Prefer market cap and % change over tiny unit prices in lists.
- Replace "2x" with "doubles" in Simple mode copy.

## 5. Suggested order of work
1. Theme + shared components (badge, token card, buttons, sheet, tab bar).
2. Restyle Discover, Token, Trade, Portfolio, Feed — screenshots — commit.
3. Watchlist + Alerts + quiet hours.
4. Weekly recap + scams-avoided count.
5. Sift wallet + auto-trading: proposal first (see section 3), then build on devnet.
