# Putting Sift online (test version, devnet)

Two parts:

1. The API runs on Render, so the app works without your laptop.
2. A real Android app, built by Expo, that testers install from a link.

Everything stays on devnet (test SOL).

## 1. The API on Render

1. Create a free account at https://render.com and connect your GitHub account.
2. Click **New** > **Blueprint**, pick the `gm-meme` repository, and confirm. Render reads
   `render.yaml` from the repo.
3. Render asks for four values. Paste them into Render's form, never into chat:
   - `HELIUS_API_KEY`: from https://dashboard.helius.dev (the same one in `apps/api/.env`).
   - `SUPABASE_URL`: `https://ypsnxeacrxghtelikjtm.supabase.co`.
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase > Project Settings > API Keys > `service_role`.
   - `ANTHROPIC_API_KEY`: optional. Leave it empty for rules-based summaries.
4. Click **Apply**. The first deploy takes a few minutes.
5. When it's live, open `https://<your-service>.onrender.com/health`. It should show
   `{"status":"ok","cluster":"devnet"}`.
6. Send the address (not any keys) to Claude, so the app build points at it.

On startup the API registers its Helius webhook by itself, so new tokens stream in without
polling.

The free plan sleeps after 15 idle minutes: the first request then takes about a minute,
and price alerts pause while it sleeps. The Starter plan ($7/month) keeps it always on.

## 2. The Android test app

1. Create a free account at https://expo.dev.
2. In expo.dev: your avatar > **Account settings** > **Access tokens** > **Create token**.
   Name it `github`, then copy it.
3. In GitHub: the `gm-meme` repo > **Settings** > **Secrets and variables** > **Actions** >
   **New repository secret**. Name: `EXPO_TOKEN`, value: the token. Save.
4. In GitHub: **Actions** > **Build test app** > **Run workflow**. Keep `android` and
   `preview`, then click **Run workflow**.
5. After about 15–20 minutes, the build appears at https://expo.dev under the `sift`
   project > **Builds**, with an install link and a QR code.
6. Open the link on an Android phone and install the app. Android asks you to allow
   installs from your browser.

The first run creates the Expo project and the app's signing key; Expo stores the key.

**iPhone** builds need an Apple Developer account ($99/year). Once you have one, the same
button with `ios` works after a one-time Apple sign-in.

**Push notifications for price alerts** also need a free Firebase project for Android. That
comes next; until then, alerts show in the Watchlist tab.
