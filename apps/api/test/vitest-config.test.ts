import { describe, expect, it } from 'vitest';
import vitestConfig, { resolveTestDatabaseUrl } from '../../../vitest.config';

describe('test database isolation', () => {
  it('uses TEST_DATABASE_URL when a worktree provides an isolated database', () => {
    const isolatedUrl =
      'postgresql://postgres:postgres@localhost:5432/growth_worktree_test?schema=public';

    expect(resolveTestDatabaseUrl({ TEST_DATABASE_URL: isolatedUrl })).toBe(isolatedUrl);
  });

  it('rejects a missing or ordinary development database target', () => {
    expect(() => resolveTestDatabaseUrl({})).toThrow('TEST_DATABASE_URL is required');
    expect(() =>
      resolveTestDatabaseUrl({
        TEST_DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/growth_db',
      })
    ).toThrow('test, sandbox, or ci segment');
  });

  it('rejects incidental ci text and non-PostgreSQL URLs', () => {
    expect(() =>
      resolveTestDatabaseUrl({
        TEST_DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/social',
      })
    ).toThrow('test, sandbox, or ci segment');
    expect(() =>
      resolveTestDatabaseUrl({
        TEST_DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/financial',
      })
    ).toThrow('test, sandbox, or ci segment');
    expect(() =>
      resolveTestDatabaseUrl({ TEST_DATABASE_URL: 'mysql://localhost/growth_test' })
    ).toThrow('valid PostgreSQL URL');
  });

  it('runs files serially when integration tests share one PostgreSQL database', () => {
    expect(vitestConfig.test?.fileParallelism).toBe(false);
  });
});
