import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateEnv } from '../src/plugins/env';

const DATABASE_URL = 'postgresql://example.invalid/growth_test';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('environment parsing', () => {
  it('falls back to the default port when PORT is empty', () => {
    expect(validateEnv({ DATABASE_URL, PORT: '' }).PORT).toBe(3000);
  });

  it('keeps an explicitly requested ephemeral port', () => {
    expect(validateEnv({ DATABASE_URL, PORT: '0' }).PORT).toBe(0);
  });

  it('uses the default port when PORT is absent', () => {
    expect(validateEnv({ DATABASE_URL }).PORT).toBe(3000);
  });

  it('rejects a non-numeric port instead of binding port 0 silently', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => validateEnv({ DATABASE_URL, PORT: 'abc' })).toThrow('Environment validation failed');
    expect(spy).toHaveBeenCalled();
  });
});