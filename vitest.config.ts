import { defineConfig } from 'vitest/config';

export const defaultTestDatabaseUrl =
  'postgresql://postgres:postgres@localhost:5432/growth_db?schema=public';

export function resolveTestDatabaseUrl(environment: { TEST_DATABASE_URL?: string } = process.env): string {
  return environment.TEST_DATABASE_URL?.trim() || defaultTestDatabaseUrl;
}

export default defineConfig({
  test: {
    env: {
      // Allow every worktree/branch to use an isolated database. Falling back
      // keeps the existing CI contract, while TEST_DATABASE_URL prevents a
      // divergent branch migration from contaminating another branch's tests.
      DATABASE_URL: resolveTestDatabaseUrl(),
      NODE_ENV: 'test'
    }
  }
});
