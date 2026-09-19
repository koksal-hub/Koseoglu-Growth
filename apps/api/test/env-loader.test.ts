import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { bootstrapEnv, shouldAutoLoadEnv } from '../src/env-loader';

const KEYS = ['GROWTH_ENV_LOADER_MISSING_KEY', 'GROWTH_ENV_LOADER_PRESENT_KEY'] as const;

function writeEnvFile(contents: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'growth-env-loader-'));
  writeFileSync(path.join(dir, '.env'), contents, 'utf8');
  return dir;
}

afterEach(() => {
  for (const key of KEYS) delete process.env[key];
});

describe('env loader (development/start only)', () => {
  it('loads keys from the repository-root .env', () => {
    const dir = writeEnvFile('GROWTH_ENV_LOADER_MISSING_KEY=loaded\n');
    expect(bootstrapEnv(dir)).toBe(true);
    expect(process.env.GROWTH_ENV_LOADER_MISSING_KEY).toBe('loaded');
  });

  it('never overrides a value that is already present in the real environment', () => {
    process.env.GROWTH_ENV_LOADER_PRESENT_KEY = 'real-env';
    const dir = writeEnvFile('GROWTH_ENV_LOADER_PRESENT_KEY=from-file\n');
    bootstrapEnv(dir);
    expect(process.env.GROWTH_ENV_LOADER_PRESENT_KEY).toBe('real-env');
  });

  it('is a no-op when the .env file does not exist', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'growth-env-loader-empty-'));
    expect(bootstrapEnv(dir)).toBe(false);
  });

  it('is skipped for test runners so a developer .env cannot flip runtime gates', () => {
    expect(shouldAutoLoadEnv({ NODE_ENV: 'test' })).toBe(false);
    expect(shouldAutoLoadEnv({ VITEST: 'true' })).toBe(false);
    expect(shouldAutoLoadEnv({ NODE_ENV: 'development' })).toBe(true);
    expect(shouldAutoLoadEnv({})).toBe(true);
  });
});