import { describe, expect, it } from 'vitest';
import { createRequestRegistry } from './phantom-requests';

describe('Phantom request registry', () => {
  it('resolves the waiting request with its redirect', async () => {
    const registry = createRequestRegistry();
    const result = registry.start('connect');
    expect(registry.waiting).toBe(true);
    expect(registry.deliver('connect', { data: 'x' })).toBe(true);
    await expect(result).resolves.toEqual({ data: 'x' });
    expect(registry.waiting).toBe(false);
  });

  it('ignores redirects nobody is waiting for', () => {
    const registry = createRequestRegistry();
    expect(registry.deliver('connect', {})).toBe(false);
    void registry.start('signTransaction').catch(() => {});
    expect(registry.deliver('connect', {})).toBe(false);
    expect(registry.waiting).toBe(true);
  });

  it('cancels: explicitly, or when a new request replaces an open one', async () => {
    const registry = createRequestRegistry();
    const first = registry.start('connect');
    const second = registry.start('connect');
    await expect(first).rejects.toMatchObject({ code: 'CANCELLED' });
    registry.cancel();
    await expect(second).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(registry.waiting).toBe(false);
  });
});
