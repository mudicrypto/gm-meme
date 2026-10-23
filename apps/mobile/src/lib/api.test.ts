import { describe, expect, it, vi } from 'vitest';
import { ApiError, apiUrl, authed, getJson } from './api';

describe('apiUrl', () => {
  it('joins base and path', () => {
    expect(apiUrl('/health', 'http://localhost:3000')).toBe('http://localhost:3000/health');
  });

  it('handles stray slashes', () => {
    expect(apiUrl('tokens/new', 'http://api.test/')).toBe('http://api.test/tokens/new');
    expect(apiUrl('//health', 'http://api.test//')).toBe('http://api.test/health');
  });
});

describe('getJson', () => {
  it('returns parsed JSON', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: 1 })));
    expect(await getJson('/x', fetchFn)).toEqual({ ok: 1 });
  });

  it('surfaces the API message on errors', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'No token mint at this address.' }), {
        status: 404,
      }),
    );
    await expect(getJson('/x', fetchFn)).rejects.toMatchObject({
      status: 404,
      message: 'No token mint at this address.',
    });
  });

  it('turns network failures into a friendly error', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('Network request failed'));
    const error = await getJson('/x', fetchFn).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 0,
      message: expect.stringContaining("Can't reach Sift"),
    });
  });
});

describe('authed', () => {
  it('sends the bearer token and JSON body, and accepts empty 204 replies', async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 204 }));
    await expect(
      authed('tok', 'PUT', '/me/profile', { handle: 'a' }, fetchFn as typeof fetch),
    ).resolves.toBeUndefined();
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('PUT');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer tok');
    expect(init.body).toBe('{"handle":"a"}');
  });

  it('sends no authorization header when signed out', async () => {
    const fetchFn = vi.fn(async () => new Response('{"profiles":[]}'));
    await authed(null, 'GET', '/profiles?q=a', undefined, fetchFn as typeof fetch);
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).has('authorization')).toBe(false);
    expect(init.body).toBeUndefined();
  });
});

describe('insecureApiUrl', () => {
  it('refuses plain http in release builds only', async () => {
    const { insecureApiUrl } = await import('./api');
    expect(insecureApiUrl('http://192.168.1.20:3000', false)).toBe(true);
    expect(insecureApiUrl('https://api.example.com', false)).toBe(false);
    expect(insecureApiUrl('http://localhost:3000', true)).toBe(false);
  });
});
