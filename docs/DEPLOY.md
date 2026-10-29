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

## 3. Notifications for price alerts (Android)

Android delivers notifications through Google's Firebase, which is free.

1. Go to https://console.firebase.google.com and click **Create a project**. Name it `sift`.
   Google Analytics isn't needed.
2. In the project, click the **Android** icon (**Add app**):
   - **Package name:** `app.sift.mobile`
   - Click **Register app**, then **Download google-services.json**.
   - Skip the remaining SDK steps: Expo handles them.
3. Put that file in the repo through GitHub's website: open the `gm-meme` repo, go into
   `apps/mobile`, then **Add file** > **Upload files**, drop in `google-services.json`, and
   commit. This file only holds public identifiers, so it's safe in the repo.
4. Create the secret sending key: in Firebase, go to **Project settings** >
   **Service accounts** > **Generate new private key**. A JSON file downloads. It is a real
   secret, so keep it out of GitHub and out of chat.
5. Upload that key to Expo: on expo.dev, open the `sift` project > **Credentials** >
   **Android** > `app.sift.mobile` > **FCM V1 service account key** >
   **Add a service account key**. Upload the file and save. You can then delete the file
   from your computer.
6. Build again (**Actions** > **Build test app**) and install the new build.
7. In the app, sign in, open the **Watchlist** tab, and tap **Send a test notification**.
   Allow notifications when Android asks. The test should appear within seconds.

## 4. The Sift wallet (devnet)

The Sift wallet's keys live in Privy, never on Sift's server. To switch it on:

1. Run `supabase/migrations/20261029000000_sift_wallet.sql` in Supabase > **SQL Editor**.
2. Create a free account at https://dashboard.privy.io and an app named `Sift`.
3. In the app: **App settings** > **Basics**. Copy the **App ID** and **App secret**.
4. In the **Wallets** section, open **Authorization keys** and click **New key**. Privy
   shows the private key once (it starts with `wallet-auth:`): copy it now, because Privy
   can't show it again. Copy the key's **ID** too.
5. In Render, open the API service > **Environment** and add these four values. Paste them
   into Render only, never into chat:
   - `PRIVY_APP_ID`, `PRIVY_APP_SECRET`
   - `PRIVY_AUTHORIZATION_KEY` (the `wallet-auth:` key)
   - `PRIVY_OWNER_ID` (the key's ID)
6. Save. Render redeploys. In the app, open **Portfolio** > **Get your Sift wallet**.

Emergency stop: set `SIFT_SIGNING_FROZEN=true` in Render. Nothing is signed until you set it
back. For a full stop at Privy too, delete the authorization key in the Privy dashboard.
