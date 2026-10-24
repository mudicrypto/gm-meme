import { z } from 'zod';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushSender {
  /** Send; resolves with the tokens Expo says are no longer registered. */
  send(messages: readonly PushMessage[]): Promise<string[]>;
}

// The Android channel the app creates for price alerts (lib/push.ts): high importance.
export const PRICE_ALERT_CHANNEL = 'price-alerts';

/** Expo push tokens look like ExponentPushToken[xxxx] (or ExpoPushToken[xxxx]). */
export const EXPO_PUSH_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,100}\]$/;

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK = 100;

const ticketsSchema = z.object({
  data: z.array(
    z.object({
      status: z.enum(['ok', 'error']),
      details: z.object({ error: z.string().optional() }).optional(),
    }),
  ),
});

/** Expo's push service, which delivers to both APNs and FCM. */
export function createExpoPushSender(
  opts: { accessToken?: string; fetchFn?: typeof fetch } = {},
): PushSender {
  const fetchFn = opts.fetchFn ?? fetch;
  return {
    async send(messages) {
      const gone: string[] = [];
      for (let i = 0; i < messages.length; i += CHUNK) {
        const chunk = messages.slice(i, i + CHUNK);
        const res = await fetchFn(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            ...(opts.accessToken ? { authorization: `Bearer ${opts.accessToken}` } : {}),
          },
          body: JSON.stringify(
            chunk.map((m) => ({
              ...m,
              sound: 'default',
              priority: 'high',
              channelId: PRICE_ALERT_CHANNEL,
            })),
          ),
        });
        if (!res.ok) throw new Error(`Expo push failed: ${res.status}`);
        const tickets = ticketsSchema.safeParse(await res.json());
        if (!tickets.success) continue;
        tickets.data.data.forEach((ticket, index) => {
          const message = chunk[index];
          if (message && ticket.details?.error === 'DeviceNotRegistered') gone.push(message.to);
        });
      }
      return gone;
    },
  };
}
