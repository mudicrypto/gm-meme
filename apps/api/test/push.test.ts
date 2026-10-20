import { describe, expect, it, vi } from 'vitest';
import { EXPO_PUSH_TOKEN, createExpoPushSender } from '../src/social/push';

describe('Expo push sender', () => {
  it('posts messages in chunks and reports unregistered devices', async () => {
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      const sent = JSON.parse(String(init?.body)) as { to: string }[];
      return new Response(
        JSON.stringify({
          data: sent.map((m) =>
            m.to.includes('gone')
              ? { status: 'error', details: { error: 'DeviceNotRegistered' } }
              : { status: 'ok' },
          ),
        }),
      );
    });
    const sender = createExpoPushSender({ fetchFn: fetchFn as typeof fetch, accessToken: 'tok' });
    const messages = Array.from({ length: 150 }, (_, i) => ({
      to: i === 120 ? 'ExponentPushToken[gone]' : `ExponentPushToken[ok${i}]`,
      title: 't',
      body: 'b',
    }));
    expect(await sender.send(messages)).toEqual(['ExponentPushToken[gone]']);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://exp.host/--/api/v2/push/send');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer tok');
  });

  it('only accepts Expo push token shapes', () => {
    expect(EXPO_PUSH_TOKEN.test('ExponentPushToken[abcdefghij12]')).toBe(true);
    expect(EXPO_PUSH_TOKEN.test('https://evil.example')).toBe(false);
  });
});
