import { describe, expect, it } from 'vitest';
import { defaultTestDatabaseUrl, resolveTestDatabaseUrl } from '../../../vitest.config';

describe('test database isolation', () => {
  it('uses TEST_DATABASE_URL when a worktree provides an isolated database', () => {
    const isolatedUrl =
      'postgresql://postgres:postgres@localhost:5432/growth_isolated?schema=public';

    expect(resolveTestDatabaseUrl({ TEST_DATABASE_URL: isolatedUrl })).toBe(isolatedUrl);
  });

  it('keeps the existing CI database contract when no override is provided', () => {
    expect(resolveTestDatabaseUrl({})).toBe(defaultTestDatabaseUrl);
    expect(resolveTestDatabaseUrl({ TEST_DATABASE_URL: '   ' })).toBe(defaultTestDatabaseUrl);
  });
});
