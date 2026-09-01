import { defineConfig } from 'vitest/config';

export function resolveTestDatabaseUrl(
  environment: { TEST_DATABASE_URL?: string } = process.env
): string {
  const candidate = environment.TEST_DATABASE_URL?.trim();
  if (!candidate) {
    throw new Error('TEST_DATABASE_URL is required for database-backed tests');
  }
  let databaseName: string;
  try {
    const parsed = new URL(candidate);
    if (!['postgresql:', 'postgres:'].includes(parsed.protocol)) {
      throw new Error('not-postgresql');
    }
    databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  } catch {
    throw new Error('TEST_DATABASE_URL must be a valid PostgreSQL URL');
  }
  if (!/(?:^|_)(?:test|sandbox|ci)(?:_|$)/i.test(databaseName)) {
    throw new Error(
      'TEST_DATABASE_URL must name an isolated database with a test, sandbox, or ci segment'
    );
  }
  return candidate;
}

export default defineConfig({
  test: {
    // API integration files share one PostgreSQL database and use
    // SERIALIZABLE transactions. Parallel files can make independent fixtures
    // produce PostgreSQL serialization aborts.
    fileParallelism: false,
    env: {
      // Every worktree/branch must name an isolated database explicitly so a
      // divergent migration or append-only receipt cannot pollute a dev DB.
      DATABASE_URL: resolveTestDatabaseUrl(),
      NODE_ENV: 'test',
    },
  },
});
