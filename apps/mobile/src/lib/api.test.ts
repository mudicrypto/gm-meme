import { describe, expect, it } from 'vitest';
import { apiUrl } from './api';

describe('apiUrl', () => {
  it('joins base and path', () => {
    expect(apiUrl('/health', 'http://localhost:3000')).toBe('http://localhost:3000/health');
  });

  it('handles stray slashes', () => {
    expect(apiUrl('tokens/new', 'http://api.test/')).toBe('http://api.test/tokens/new');
    expect(apiUrl('//health', 'http://api.test//')).toBe('http://api.test/health');
  });
});
