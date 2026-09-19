import { expect, vi } from 'vitest';
import { validateEnv } from '../../src/plugins/env';

/**
 * Runs env validation expecting a failure and returns the rendered validation
 * report, so a test can assert *why* a configuration was rejected (for example
 * "is required in production" instead of an unrelated length error).
 */
export function captureEnvFailure(raw: NodeJS.ProcessEnv): string {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    expect(() => validateEnv(raw)).toThrow('Environment validation failed');
    return spy.mock.calls.map((call) => JSON.stringify(call)).join('\n');
  } finally {
    spy.mockRestore();
  }
}
