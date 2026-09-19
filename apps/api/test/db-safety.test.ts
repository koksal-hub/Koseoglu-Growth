import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// PR-B2A gate regression suite (DB-3/DB-4/DB-9). Deliberately database-free and
// deterministic: the fail-closed target guard, the migration history/checksum
// classification and the 63 byte object-name rule are exercised through the
// gate CLI, so a broken gate fails the normal `pnpm test` run too.
// Vitest runs from the repository root (root vitest.config.ts), so the gate CLI
// path is resolved from the working directory.
const repoRoot = process.cwd();
const safetyScript = join(repoRoot, 'apps', 'api', 'scripts', 'db-safety.mjs');
const tempDirs: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function runCli(args: string[]): { code: number; output: string } {
  const env = { ...process.env, ALLOW_NON_LOCAL_DB_TARGET: '', B2A_ALLOWED_DB_HOSTS: '' };
  try {
    const output = execFileSync(process.execPath, [safetyScript, ...args], {
      cwd: repoRoot,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, output };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return { code: failure.status ?? 1, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
  }
}

function sha256Hex(text: string): string {
  return createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

function historyFixture(
  migrations: Record<string, string>,
  applied: Array<{ name: string; checksum: string | null }>
) {
  const dir = tempDir('b2a-history-');
  const migrationsDir = join(dir, 'migrations');
  for (const [name, sql] of Object.entries(migrations)) {
    mkdirSync(join(migrationsDir, name), { recursive: true });
    writeFileSync(join(migrationsDir, name, 'migration.sql'), sql, 'utf8');
  }
  const appliedPath = join(dir, 'applied.json');
  writeFileSync(
    appliedPath,
    JSON.stringify(applied.map((row) => ({ ...row, finishedAt: '2026-09-19T00:00:00.000Z', rolledBackAt: null }))),
    'utf8'
  );
  return { migrationsDir, appliedPath };
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('PR-B2A database safety gate', () => {
  it('accepts a disposable target and rejects canonical, shared and production-like targets', () => {
    const accepted = runCli([
      'guard',
      '--url',
      'postgresql://postgres:postgres@localhost:5432/growth_test_20260919?schema=public',
    ]);
    expect(accepted.code).toBe(0);
    expect(accepted.output).toContain('GUARD OK');

    const canonical = runCli(['guard', '--url', 'postgresql://postgres:postgres@localhost:5432/growth_db']);
    expect(canonical.code).toBe(1);
    expect(canonical.output).toContain('canonical/maintenance database');

    const shared = runCli(['guard', '--url', 'postgresql://postgres:postgres@localhost:5432/growth_prod']);
    expect(shared.code).toBe(1);
    expect(shared.output).toContain('test/ci/sandbox/shadow/b2a segment');

    const remote = runCli(['guard', '--url', 'postgresql://postgres:postgres@db.prod.example.com:5432/growth_test']);
    expect(remote.code).toBe(1);
    expect(remote.output).toContain('known-local hosts');

    const shadowWithoutOwnName = runCli([
      'guard',
      '--url',
      'postgresql://postgres:postgres@localhost:5432/growth_test_20260919?schema=public',
      '--role',
      'shadow',
    ]);
    expect(shadowWithoutOwnName.code).toBe(1);
    expect(shadowWithoutOwnName.output).toContain('shadow target needs its own dedicated name');
  });

  it('accepts the repository object names and rejects an overlong migration identifier', () => {
    const real = runCli(['object-names']);
    expect(real.code).toBe(0);
    expect(real.output).toContain('OBJECT NAMES OK');
    // The one historical name PostgreSQL truncated is exempted explicitly.
    expect(real.output).toContain('LEGACY EXEMPT (72 bytes, 20260902030000_add_recommendation_measurement_receipts)');
    expect(real.output).toContain('LEGACY EXEMPT (78 bytes, 20260901085500_add_contact_permission_gate)');

    // Prisma itself refuses an overlong explicit `map`, but identifiers inside
    // migration SQL are never validated - that is the historical failure class.
    const dir = tempDir('b2a-object-names-');
    const migrationsDir = join(dir, 'migrations');
    const migrationName = '20260101000000_b2a_long_name_fixture';
    mkdirSync(join(migrationsDir, migrationName), { recursive: true });
    writeFileSync(
      join(migrationsDir, migrationName, 'migration.sql'),
      'CREATE INDEX "RecommendationExposure_recommendationType_recommendationId_exposedAt_idx_b2a" ON "Fixture"("column");\n',
      'utf8'
    );
    const fixture = runCli(['object-names', '--migrations-dir', migrationsDir]);
    expect(fixture.code).toBe(1);
    expect(fixture.output).toContain('OVERLONG');
    expect(fixture.output).toContain('RecommendationExposure_recommendationType_recommendationId_exposedAt_idx_b2a');
  });

  it('reports an in-sync history as OK, including a line-ending variant of the same content', () => {
    const sql = 'SELECT 1;\n';
    const inSync = historyFixture(
      { '20260101000000_first': sql },
      [{ name: '20260101000000_first', checksum: sha256Hex(sql) }]
    );
    const result = runCli(['history', '--applied-json', inSync.appliedPath, '--migrations-dir', inSync.migrationsDir]);
    expect(result.code).toBe(0);
    expect(result.output).toContain('HISTORY OK');
    expect(result.output).toContain('applied=1 repo=1');

    // Prisma hashes the bytes it read at apply time, so a Windows checkout that
    // applied migrations with CRLF hashes differs from the LF checkout. Both are
    // exact hashes of the same content and must still be accepted.
    const crlfSql = 'SELECT 1;\r\n';
    const crlfApplied = historyFixture(
      { '20260101000000_first': crlfSql },
      [{ name: '20260101000000_first', checksum: sha256Hex(sql) }]
    );
    const crlfResult = runCli([
      'history',
      '--applied-json',
      crlfApplied.appliedPath,
      '--migrations-dir',
      crlfApplied.migrationsDir,
    ]);
    expect(crlfResult.code).toBe(0);
    expect(crlfResult.output).toContain('HISTORY OK');
  });

  it('fails on a missing, unknown or edited applied migration', () => {
    const firstSql = 'SELECT 1;';
    const secondSql = 'SELECT 2;';

    const missing = historyFixture({ '20260101000000_first': firstSql }, []);
    const missingResult = runCli([
      'history',
      '--applied-json',
      missing.appliedPath,
      '--migrations-dir',
      missing.migrationsDir,
    ]);
    expect(missingResult.code).toBe(1);
    expect(missingResult.output).toContain('MISSING (repo only): 20260101000000_first');
    expect(missingResult.output).toContain('HISTORY FAIL');

    const unknown = historyFixture(
      { '20260101000000_first': firstSql },
      [
        { name: '20260101000000_first', checksum: sha256Hex(firstSql) },
        { name: '20260901000000_repo_missing', checksum: sha256Hex(secondSql) },
      ]
    );
    const unknownResult = runCli([
      'history',
      '--applied-json',
      unknown.appliedPath,
      '--migrations-dir',
      unknown.migrationsDir,
    ]);
    expect(unknownResult.code).toBe(1);
    expect(unknownResult.output).toContain('UNKNOWN (db only): 20260901000000_repo_missing');

    const tampered = historyFixture(
      { '20260101000000_first': `${firstSql}\n-- edited after it was applied` },
      [{ name: '20260101000000_first', checksum: sha256Hex(firstSql) }]
    );
    const tamperedResult = runCli([
      'history',
      '--applied-json',
      tampered.appliedPath,
      '--migrations-dir',
      tampered.migrationsDir,
    ]);
    expect(tamperedResult.code).toBe(1);
    expect(tamperedResult.output).toContain('CHECKSUM MISMATCH: 20260101000000_first');
  });
});

// PR-B2B (DB-6/DB-7): the fingerprint must explain a database
// (IN_SYNC / BEHIND / AHEAD / DIVERGED / UNKNOWN) and fail closed on DIVERGED and
// on a production-like UNKNOWN; the db push guard must refuse destructive pushes
// on shared and production-like targets. Both are driven through the CLI, so a
// broken guard fails the normal test run.
function repoAppliedRows(): Array<{ name: string; checksum: string; finishedAt: string; rolledBackAt: string | null }> {
  const migrationsDir = join(repoRoot, 'prisma', 'migrations');
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => {
      const sql = readFileSync(join(migrationsDir, name, 'migration.sql'), 'utf8');
      return {
        name,
        checksum: sha256Hex(sql.replace(/\r\n/g, '\n')),
        finishedAt: '2026-09-19T00:00:00.000Z',
        rolledBackAt: null,
      };
    });
}

function appliedFixture(rows: Array<{ name: string; checksum: string; finishedAt: string; rolledBackAt: string | null }>): string {
  const path = join(tempDir('b2b-applied-'), 'applied.json');
  writeFileSync(path, JSON.stringify(rows), 'utf8');
  return path;
}

describe('PR-B2B database fingerprint and db push guard', () => {
  const repoRows = repoAppliedRows();
  const disposableUrl = 'postgresql://postgres:postgres@localhost:5432/growth_test_20260919_b2b?schema=public';
  const unknownRow = {
    name: '20260101000000_b2b_unknown',
    checksum: 'a'.repeat(64),
    finishedAt: '2026-09-19T00:00:00.000Z',
    rolledBackAt: null,
  };

  it('classifies aligned history as IN_SYNC, BEHIND and AHEAD', () => {
    const inSync = runCli(['fingerprint', '--url', disposableUrl, '--applied-json', appliedFixture(repoRows)]);
    expect(inSync.code).toBe(0);
    expect(inSync.output).toContain('FINGERPRINT STATUS: IN_SYNC');
    expect(inSync.output).toContain('FINGERPRINT OK');

    const behind = runCli(['fingerprint', '--url', disposableUrl, '--applied-json', appliedFixture(repoRows.slice(0, -1))]);
    expect(behind.code).toBe(0);
    expect(behind.output).toContain('FINGERPRINT STATUS: BEHIND');
    expect(behind.output).toContain(`MISSING (repo only): ${repoRows[repoRows.length - 1].name}`);

    const ahead = runCli(['fingerprint', '--url', disposableUrl, '--applied-json', appliedFixture([...repoRows, unknownRow])]);
    expect(ahead.code).toBe(0);
    expect(ahead.output).toContain('FINGERPRINT STATUS: AHEAD');
    expect(ahead.output).toContain(`UNKNOWN (db only): ${unknownRow.name}`);
  });

  it('fails closed on DIVERGED history (both directions and rewritten content)', () => {
    const bothDirections = runCli([
      'fingerprint',
      '--url',
      disposableUrl,
      '--applied-json',
      appliedFixture([...repoRows.slice(0, -1), unknownRow]),
    ]);
    expect(bothDirections.code).toBe(1);
    expect(bothDirections.output).toContain('FINGERPRINT STATUS: DIVERGED');
    expect(bothDirections.output).toContain('FINGERPRINT FAIL (fail-closed)');

    const rewrittenRows = repoRows.map((row, index) => (index === 0 ? { ...row, checksum: 'b'.repeat(64) } : row));
    const rewritten = runCli(['fingerprint', '--url', disposableUrl, '--applied-json', appliedFixture(rewrittenRows)]);
    expect(rewritten.code).toBe(1);
    expect(rewritten.output).toContain('FINGERPRINT STATUS: DIVERGED');
    expect(rewritten.output).toContain('applied migration content was rewritten');
  });

  it('reports UNKNOWN on a disposable target but fails closed on a production-like one', () => {
    const missingUrl = 'postgresql://postgres:postgres@localhost:5432/growth_test_b2b_missing?schema=public';

    const reportOnly = runCli(['fingerprint', '--url', missingUrl, '--env', 'development']);
    expect(reportOnly.code).toBe(0);
    expect(reportOnly.output).toContain('FINGERPRINT STATUS: UNKNOWN');
    expect(reportOnly.output).toContain('report-only');

    const failClosed = runCli(['fingerprint', '--url', missingUrl, '--env', 'production']);
    expect(failClosed.code).toBe(1);
    expect(failClosed.output).toContain('FINGERPRINT STATUS: UNKNOWN');
    expect(failClosed.output).toContain('FINGERPRINT FAIL (fail-closed)');
  });

  it('refuses destructive db push on shared/production-like targets and allows a disposable one', () => {
    const allowed = runCli(['db-push-guard', '--url', disposableUrl, '--env', 'test', '--', '--accept-data-loss']);
    expect(allowed.code).toBe(0);
    expect(allowed.output).toContain('DB PUSH ALLOWED');
    expect(allowed.output).toContain('destructive=--accept-data-loss');

    const shared = runCli([
      'db-push-guard',
      '--url',
      'postgresql://postgres:postgres@localhost:5432/growth_prod',
      '--env',
      'development',
      '--',
      '--accept-data-loss',
    ]);
    expect(shared.code).toBe(1);
    expect(shared.output).toContain('refusing --accept-data-loss');
    expect(shared.output).toContain('no disposable segment');

    const productionLike = runCli([
      'db-push-guard',
      '--url',
      'postgresql://postgres:postgres@localhost:5432/growth_prod',
      '--env',
      'production',
      '--',
      '--accept-data-loss',
    ]);
    expect(productionLike.code).toBe(1);
    expect(productionLike.output).toContain('production-like target');

    const reset = runCli([
      'db-push-guard',
      '--url',
      'postgresql://postgres:postgres@localhost:5432/growth_features',
      '--env',
      'development',
      '--',
      '--force-reset',
    ]);
    expect(reset.code).toBe(1);
    expect(reset.output).toContain('refusing --force-reset');

    const plainPushOnRemoteHost = runCli([
      'db-push-guard',
      '--url',
      'postgresql://postgres:postgres@db.prod.example.com:5432/growth_test',
      '--env',
      'development',
    ]);
    expect(plainPushOnRemoteHost.code).toBe(1);
    expect(plainPushOnRemoteHost.output).toContain('production-like target');

    // Regression: the CLI must forward --env to the guard. Before this was fixed
    // a disposable-named database in a production environment slipped through.
    const plainPushOnDisposableNameInProduction = runCli([
      'db-push-guard',
      '--url',
      disposableUrl,
      '--env',
      'production',
    ]);
    expect(plainPushOnDisposableNameInProduction.code).toBe(1);
    expect(plainPushOnDisposableNameInProduction.output).toContain('production-like target');
  });
});
