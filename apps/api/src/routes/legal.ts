import { SIFT_PLATFORM_FEE_BPS } from '@sift/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { Config } from '../config';

// Public pages the app stores link to: privacy policy, terms and support. Plain HTML, no
// scripts, no trackers. A lawyer should review the wording before each store submission.

const UPDATED = '30 October 2026';

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} · Sift</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #0B0D10; color: #E1E5EB; font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 32px 16px 64px; }
  h1 { color: #F3F5F7; font-size: 28px; margin: 0 0 4px; }
  h2 { color: #F3F5F7; font-size: 18px; margin: 32px 0 8px; }
  p, li { color: #C9D0DB; }
  a { color: #63E6BE; }
  .muted { color: #A0AABA; font-size: 14px; }
  nav a { margin-right: 16px; }
</style>
</head>
<body><main>
<nav class="muted"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/support">Support</a></nav>
${body}
</main></body>
</html>`;
}

function contact(config: Config): string {
  return config.SUPPORT_EMAIL
    ? `<a href="mailto:${escape(config.SUPPORT_EMAIL)}">${escape(config.SUPPORT_EMAIL)}</a>`
    : 'the support details on our <a href="/support">support page</a>';
}

function privacy(config: Config): string {
  const operator = escape(config.OPERATOR_NAME ?? 'Sift');
  return page(
    'Privacy policy',
    `<h1>Privacy policy</h1>
<p class="muted">Last updated ${UPDATED}. ${operator} runs the Sift app and this service.</p>

<h2>The short version</h2>
<p>Sift has no passwords, no email sign-up, no ads and no analytics or tracking. You sign in by
signing a message with a Solana wallet. Sift keeps only what the features you use need, and you
can delete your account in the app at any time.</p>

<h2>What Sift keeps</h2>
<ul>
<li><b>Your wallet's public address</b>, to sign you in. Blockchain addresses and transactions
are public by nature.</li>
<li><b>Sign-in sessions</b>: only a hash of each session token, which expires.</li>
<li><b>Your profile</b> if you make one: handle, display name, who you follow, and whether you
share trades. Public profiles never show your wallet address.</li>
<li><b>Shared trades</b>, only while you have trade sharing turned on (it's off by default).</li>
<li><b>Watchlist and price alerts</b> you create.</li>
<li><b>A push notification token</b> for your device, if you allow notifications.</li>
<li><b>Sift wallet</b> (if you create one): the wallet's address and its ID at our wallet
provider, your spending limits, withdrawal address, automatic orders and spending history, and
the secret for two-factor codes if you turn them on. <b>Sift never sees or stores the wallet's
private key</b>; it's held by our wallet infrastructure provider.</li>
<li><b>Server logs</b> with IP addresses and requests, kept briefly for security and
rate limiting.</li>
</ul>

<h2>What stays on your phone</h2>
<p>The phone wallet's private key is created and kept in your phone's secure storage. It never
leaves the device and Sift never receives it. If you connect Phantom or another wallet app, its
keys stay in that app.</p>

<h2>Who processes data for us</h2>
<ul>
<li>Supabase (database), Render (hosting).</li>
<li>Privy (Sift wallet keys and signing).</li>
<li>Helius (Solana blockchain data) and the Solana network itself.</li>
<li>Expo and, on Android, Google Firebase (delivering push notifications).</li>
<li>Anthropic (writing token summaries; it receives token data, not data about you).</li>
</ul>
<p>We don't sell personal data or share it for advertising.</p>

<h2>Your choices</h2>
<ul>
<li>Turn trade sharing off at any time; your shared trades are then deleted.</li>
<li><b>Delete your account</b> in the app: Friends → Delete account. This removes your profile,
shared trades, follows, watchlist, alerts, push tokens and sessions. A Sift wallet must be
emptied first, so nobody loses funds by deleting.</li>
<li>Information already written to the Solana blockchain is public and can't be deleted by
anyone.</li>
</ul>

<h2>Children</h2>
<p>Sift is for adults (18+) and isn't directed at children.</p>

<h2>Contact</h2>
<p>Questions or requests: ${contact(config)}.</p>`,
  );
}

function terms(config: Config): string {
  const operator = escape(config.OPERATOR_NAME ?? 'Sift');
  const fee = SIFT_PLATFORM_FEE_BPS / 100;
  return page(
    'Terms of use',
    `<h1>Terms of use</h1>
<p class="muted">Last updated ${UPDATED}. These terms are between you and ${operator}.</p>

<h2>Not financial advice</h2>
<p>Sift shows market data, automated risk checks and plain-language summaries. None of it is
financial, investment or legal advice, and none of it tells you to buy or sell. Risk checks look
for known warning signs; a token with no flags can still lose all its value.</p>

<h2>Meme coins are high risk</h2>
<p>Most meme coins lose most or all of their value. Prices move fast, liquidity can disappear and
trades can fail or fill worse than expected. Only trade what you can afford to lose entirely.</p>

<h2>Eligibility</h2>
<p>You must be 18 or older and allowed to use crypto trading services where you live. You are
responsible for following your local laws, including taxes.</p>

<h2>Your wallets</h2>
<ul>
<li><b>Phone wallet and wallet apps</b>: you hold the keys. Sift can't access, freeze or recover
them. Back up your key; if you lose it, Sift can't help you get the funds back.</li>
<li><b>Sift wallet</b>: keys are held by our wallet infrastructure provider and used only for the
actions you approve, within the limits you set. Withdrawals to a new address wait 24 hours.</li>
</ul>

<h2>Trades and fees</h2>
<p>Before every trade Sift shows the full cost: the Sift fee (${fee}% of the trade), network and
priority fees, expected slippage and the minimum you'll receive. You confirm before anything is
signed. Blockchain transactions are final and can't be reversed.</p>

<h2>Automatic orders</h2>
<p>Stop-loss, take-profit and limit orders run on a best-effort basis. They can fill at a worse
price than the trigger, or not fill at all, for example when liquidity is gone.</p>

<h2>What you may not do</h2>
<p>Don't misuse the service, attack it, break the law with it or impersonate others.</p>

<h2>Liability</h2>
<p>Sift is provided as is. To the extent the law allows, ${operator} isn't liable for trading
losses, failed or delayed transactions, blockchain or third-party outages, or token behaviour.</p>

<h2>Changes and contact</h2>
<p>We may update these terms and will show the new date here. Contact: ${contact(config)}.</p>`,
  );
}

function support(config: Config): string {
  return page(
    'Support',
    `<h1>Support</h1>
<p>Need help with Sift? Contact ${contact(config)}.</p>
<h2>Common questions</h2>
<p><b>Can Sift recover my phone wallet?</b> No. The key lives only on your phone. Back it up in
Portfolio → Back up your key.</p>
<p><b>How do I delete my account?</b> In the app: Friends → Delete account. Empty your Sift
wallet first if you have one.</p>
<p><b>Something looks wrong with my Sift wallet?</b> Freeze it in Wallet &amp; security; nothing
can be signed while it's frozen.</p>`,
  );
}

/** GET /privacy, /terms and /support: the public pages the store listings link to. */
export const legalRoutes: FastifyPluginAsync<{ config: Config }> = async (app, { config }) => {
  const pages = {
    '/privacy': privacy(config),
    '/terms': terms(config),
    '/support': support(config),
  };
  for (const [path, html] of Object.entries(pages)) {
    app.get(path, async (_request, reply) =>
      reply
        .header('content-type', 'text/html; charset=utf-8')
        .header('cache-control', 'public, max-age=3600')
        .header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'")
        .send(html),
    );
  }
};
