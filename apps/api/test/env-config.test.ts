import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateEnv } from '../src/plugins/env';
import { captureEnvFailure } from './support/env-failure';

const DATABASE_URL = 'postgresql://example.invalid/growth_test';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('environment parsing', () => {
  it('falls back to the default port when PORT is empty', () => {
    expect(validateEnv({ DATABASE_URL, PORT: '' }).PORT).toBe(3000);
  });

  it('accepts an ephemeral port only in the test environment', () => {
    expect(validateEnv({ DATABASE_URL, PORT: '0', NODE_ENV: 'test' }).PORT).toBe(0);

    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => validateEnv({ DATABASE_URL, PORT: '0', NODE_ENV: 'development' })).toThrow(
      'Environment validation failed'
    );
    expect(() =>
      validateEnv({
        DATABASE_URL,
        PORT: '0',
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        GROWTH_INTERNAL_API_KEY: 'A'.repeat(40),
      })
    ).toThrow('Environment validation failed');
    expect(spy).toHaveBeenCalled();
  });

  it('requires a literal IP for HOST and an explicit HOST in production', () => {
    expect(validateEnv({ DATABASE_URL, HOST: '127.0.0.1' }).HOST).toBe('127.0.0.1');
    expect(validateEnv({ DATABASE_URL, HOST: '::1' }).HOST).toBe('::1');

    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // A hostname is not a bind address.
    expect(() => validateEnv({ DATABASE_URL, HOST: 'localhost' })).toThrow('Environment validation failed');
    // Production has no default bind address.
    expect(() =>
      validateEnv({ DATABASE_URL, NODE_ENV: 'production', GROWTH_INTERNAL_API_KEY: 'A'.repeat(40) })
    ).toThrow('Environment validation failed');
    expect(spy).toHaveBeenCalled();
  });

  it('parses the exposure flags with fail-closed defaults', () => {
    const defaults = validateEnv({ DATABASE_URL });
    expect(defaults.PORT).toBe(3000);
    expect(defaults.HOST).toBeUndefined();
    expect(defaults.ALLOW_EXTERNAL_BIND).toBe(false);
    expect(defaults.TRUST_PROXY_CIDRS).toBe('');
    expect(validateEnv({ DATABASE_URL, ALLOW_EXTERNAL_BIND: 'true' }).ALLOW_EXTERNAL_BIND).toBe(true);

    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => validateEnv({ DATABASE_URL, ALLOW_EXTERNAL_BIND: 'yes' })).toThrow(
      'Environment validation failed'
    );
    expect(spy).toHaveBeenCalled();
  });

  it('rejects a non-numeric port instead of binding port 0 silently', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => validateEnv({ DATABASE_URL, PORT: 'abc' })).toThrow('Environment validation failed');
    expect(spy).toHaveBeenCalled();
  });

  it('treats an empty or blank internal key as unset', () => {
    // `GROWTH_INTERNAL_API_KEY=` in an env file, a compose `:-` default and an
    // absent variable must all mean the same thing: not configured.
    expect(
      validateEnv({ DATABASE_URL, NODE_ENV: 'development', GROWTH_INTERNAL_API_KEY: '' })
        .GROWTH_INTERNAL_API_KEY
    ).toBeUndefined();
    expect(
      validateEnv({ DATABASE_URL, NODE_ENV: 'development', GROWTH_INTERNAL_API_KEY: '   ' })
        .GROWTH_INTERNAL_API_KEY
    ).toBeUndefined();
    expect(validateEnv({ DATABASE_URL, NODE_ENV: 'development' }).GROWTH_INTERNAL_API_KEY).toBeUndefined();
  });

  it('keeps production fail-closed for an empty, blank or absent internal key', () => {
    const production = { DATABASE_URL, NODE_ENV: 'production', HOST: '0.0.0.0' };
    for (const key of ['', '   ']) {
      expect(captureEnvFailure({ ...production, GROWTH_INTERNAL_API_KEY: key })).toContain(
        'is required in production'
      );
    }
    expect(captureEnvFailure(production)).toContain('is required in production');
    expect(
      validateEnv({
        ...production,
        GROWTH_INTERNAL_API_KEY: 'A'.repeat(43),
        // PR-D5: the capacity inputs are part of the production contract as well.
        API_INSTANCES: '1',
        DB_POOL_MAX: '5',
        GROWTH_DB_CONNECTION_BUDGET: '12',
      }).GROWTH_INTERNAL_API_KEY
    ).toBe('A'.repeat(43));
  });
});