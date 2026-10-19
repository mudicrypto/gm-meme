import { describe, expect, it, vi } from 'vitest';
import { ApiError, apiUrl, getJson } from './api';

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
