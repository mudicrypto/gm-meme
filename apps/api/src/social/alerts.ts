import type { FastifyBaseLogger } from 'fastify';
import type { TokenRepository } from '../tokens/repository';
import type { PushMessage, PushSender } from './push';
import type { AlertRecord, SocialRepository } from './repository';

/** Whether a price meets an alert's condition. */
export function crossed(alert: Pick<AlertRecord, 'direction' | 'priceSol'>, price: number) {
  return alert.direction === 'above' ? price >= alert.priceSol : price <= alert.priceSol;
}

/** Plain SOL price: enough significant digits for tiny meme coin prices. */
export function formatPriceSol(price: number): string {
  return `${Number(price.toPrecision(4)).toString()} SOL`;
}

/**
 * Fire every alert whose price was crossed, once, and push a notification to the owner's
 * devices. Facts only: the price and the alert they set, never a suggestion to trade.
 */
export async function checkPriceAlerts(deps: {
  social: SocialRepository;
  tokens: TokenRepository;
  push: PushSender | null;
  now: () => Date;
}): Promise<AlertRecord[]> {
  const active = await deps.social.activeAlerts();
  if (active.length === 0) return [];
  const mints = [...new Set(active.map((a) => a.mint))];
  const prices = await deps.tokens.getLatestPrices(mints);

  const fired: { alert: AlertRecord; price: number }[] = [];
  for (const alert of active) {
    const price = prices.get(alert.mint);
    if (price === undefined || !crossed(alert, price)) continue;
    if (await deps.social.triggerAlert(alert.id, deps.now().toISOString(), price)) {
      fired.push({ alert, price });
    }
  }
  if (fired.length === 0 || !deps.push) return fired.map((f) => f.alert);

  const tokens = await deps.social.pushTokens([...new Set(fired.map((f) => f.alert.wallet))]);
  const names = new Map<string, string>();
  await Promise.all(
    [...new Set(fired.map((f) => f.alert.mint))].map(async (mint) => {
      const token = await deps.tokens.getToken(mint);
      names.set(mint, token?.symbol ?? token?.name ?? `${mint.slice(0, 4)}…${mint.slice(-4)}`);
    }),
  );
  const messages: PushMessage[] = [];
  for (const { alert, price } of fired) {
    const name = names.get(alert.mint)!;
    for (const device of tokens.filter((t) => t.wallet === alert.wallet)) {
      messages.push({
        to: device.token,
        title: `${name} is ${alert.direction} ${formatPriceSol(alert.priceSol)}`,
        body: `Price now ${formatPriceSol(price)}. You set this alert in Sift.`,
        data: { mint: alert.mint, alertId: alert.id },
      });
    }
  }
  if (messages.length > 0) {
    const gone = await deps.push.send(messages);
    await Promise.all(
      tokens
        .filter((device) => gone.includes(device.token))
        .map((device) => deps.social.deletePushToken(device.wallet, device.token)),
    );
  }
  return fired.map((f) => f.alert);
}

export function startAlertChecker(opts: {
  social: SocialRepository;
  tokens: TokenRepository;
  push: PushSender | null;
  intervalMs: number;
  log: Pick<FastifyBaseLogger, 'error'>;
  now?: () => Date;
}): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    checkPriceAlerts({ ...opts, now: opts.now ?? (() => new Date()) })
      .catch((err: unknown) => opts.log.error({ err }, 'price alert check failed'))
      .finally(() => {
        running = false;
      });
  }, opts.intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
