import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Appearance: { getColorScheme: () => 'dark' },
  Platform: { OS: 'web' },
}));
vi.mock('expo-secure-store', () => ({}));

const { parseMode, resolveScheme } = await import('./appearance');

describe('appearance', () => {
  it('only accepts known modes, opening dark by default', () => {
    expect(parseMode('system')).toBe('system');
    expect(parseMode('light')).toBe('light');
    expect(parseMode('blue')).toBe('dark');
    expect(parseMode(null)).toBe('dark');
  });

  it('follows the phone in system mode, light when it has no setting', () => {
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', 'light')).toBe('light');
    expect(resolveScheme('system', null)).toBe('light');
  });

  it('a fixed choice wins over the phone', () => {
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
  });
});
