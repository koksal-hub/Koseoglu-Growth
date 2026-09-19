#!/usr/bin/env node
/**
 * PR-B2A replay + negative-proof orchestrator (DB-2/DB-3/DB-4/DB-5).
 *
 * Creates its own dedicated disposable databases (never the canonical/shared
 * database, never production-like) through `pg`, replays the immutable
 * repository migration history into them, and proves that the gate can fail.
 *
 * CLI:
 *   node apps/api/scripts/db-replay.mjs fresh
 *   node apps/api/scripts/db-replay.mjs upgrade
 *   node apps/api/scripts/db-replay.mjs negative-proof
 *   node apps/api/scripts/db-replay.mjs gate
 */
import { mkdtempSync, mkdirSync, copyFileSync, readdirSync, rmSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import pg from 'pg';
import {
  DbSafetyError,
  assertDbPushAllowed,
  assertDisposableTarget,
  classifyFingerprint,
  classifyHistory,
  describeTargetSafety,
  objectNameAudit,
  readAppliedMigrations,
  readRepoMigrations,
  runPrisma,
  repoRoot,
  schemaDrift,
  shadowConvergence,
} from './db-safety.mjs';

const RUN_ID = Date.now().toString(36);
const ROOT = repoRoot();
const SCHEMA_PATH = join(ROOT, 'prisma', 'schema.prisma');
const MIGRATIONS_DIR = join(ROOT, 'prisma', 'migrations');

/** Loads the repository .env for local runs without adding a dependency. */
export function loadEnvFile(path = join(ROOT, '.env')) {
  if (typeof process.loadEnvFile !== 'function' || !existsSync(path)) return;
  try {
    process.loadEnvFile(path);
  } catch {
    /* .env is optional; CI provides real environment variables */
  }
}

export function baseTargetUrl() {
  const raw = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!raw) throw new DbSafetyError('TEST_DATABASE_URL (or DATABASE_URL) is required for replay');
  return assertDisposableTarget(raw, { role: 'base' });
}

export function disposableUrl(baseInfo, suffix) {
  const name = `${baseInfo.database}_b2a_${suffix}_${RUN_ID}`;
  const parsed = new URL(baseInfo.raw);
  parsed.pathname = `/${name}`;
  parsed.searchParams.set('schema', 'public');
  return assertDisposableTarget(parsed.toString(), { role: 'replay' });
}

function maintenanceInfo(baseInfo) {
  const parsed = new URL(baseInfo.raw);
  parsed.pathname = '/postgres';
  parsed.searchParams.set('schema', 'public');
  return { raw: parsed.toString(), database: 'postgres' };
}

export async function createDisposableDatabase(baseInfo, suffix) {
  const target = disposableUrl(baseInfo, suffix);
  const admin = new pg.Client({ connectionString: maintenanceInfo(baseInfo).raw });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${target.database}"`);
    await admin.query(`CREATE DATABASE "${target.database}"`);
  } finally {
    await admin.end();
  }
  return target;
}

export async function dropDisposableDatabase(baseInfo, databaseName) {
  if (!databaseName.includes(`_b2a_`)) throw new DbSafetyError(`refusing to drop "${databaseName}": not a b2a disposable database`);
  const admin = new pg.Client({ connectionString: maintenanceInfo(baseInfo).raw });
  await admin.connect();
  try {
    // A lingering prismaclient/psql connection would make DROP DATABASE fail and
    // leave the disposable database behind, so terminate and retry once.
    await admin.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      [databaseName]
    );
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
        return;
      } catch (error) {
        if (attempt === 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
  } finally {
    await admin.end();
  }
}

/** Copies schema + migrations into a temp directory; the repo is never modified. */
export function tempMigrationsCopy(options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'b2a-migrations-'));
  const prismaDir = join(dir, 'prisma');
  const migrationsDir = join(prismaDir, 'migrations');
  mkdirSync(migrationsDir, { recursive: true });
  copyFileSync(SCHEMA_PATH, join(prismaDir, 'schema.prisma'));
  const names = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  const selected = options.excludeLast ? names.slice(0, -1) : names;
  for (const name of selected) {
    mkdirSync(join(migrationsDir, name), { recursive: true });
    copyFileSync(join(MIGRATIONS_DIR, name, 'migration.sql'), join(migrationsDir, name, 'migration.sql'));
  }
  if (options.extraMigrationName) {
    const extraDir = join(migrationsDir, options.extraMigrationName);
    mkdirSync(extraDir, { recursive: true });
    writeFileSync(join(extraDir, 'migration.sql'), options.extraMigrationSql ?? '', 'utf8');
  }
  return { dir, prismaDir, migrationsDir, schemaPath: join(prismaDir, 'schema.prisma'), migrations: selected };
}

export function deployMigrations(target, schemaPath = SCHEMA_PATH) {
  return runPrisma(['migrate', 'deploy', '--schema', schemaPath], { env: { DATABASE_URL: target.raw } });
}

export async function historyReport(target, migrationsDir = MIGRATIONS_DIR) {
  const applied = await readAppliedMigrations(target.raw);
  return classifyHistory(applied, readRepoMigrations(migrationsDir));
}

export function urlWithDatabase(baseInfo, database) {
  const parsed = new URL(baseInfo.raw);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

export async function freshReplay(baseInfo) {
  const repoMigrations = readRepoMigrations(MIGRATIONS_DIR);
  const target = await createDisposableDatabase(baseInfo, 'fresh');
  try {
    const deploy = deployMigrations(target);
    const history = await historyReport(target);
    const drift = schemaDrift(target.raw, SCHEMA_PATH);
    const ok = deploy.code === 0 && history.ok && history.appliedCount === repoMigrations.length && drift.ok;
    return {
      name: 'fresh replay (0 -> latest)',
      ok,
      detail: `deploy=${deploy.code} applied=${history.appliedCount}/${repoMigrations.length} history=${history.ok ? 'OK' : 'FAIL'} drift=${drift.ok ? 'zero' : 'FAIL'}`,
      exit: deploy.code,
      driftReason: drift.reason,
    };
  } finally {
    await dropDisposableDatabase(baseInfo, target.database);
  }
}

export async function upgradeReplay(baseInfo) {
  const repoMigrations = readRepoMigrations(MIGRATIONS_DIR);
  const expectedPrevious = repoMigrations.length - 1;
  const target = await createDisposableDatabase(baseInfo, 'upgrade');
  const temp = tempMigrationsCopy({ excludeLast: true });
  try {
    const previousDeploy = deployMigrations(target, temp.schemaPath);
    const previousHistory = await historyReport(target, temp.migrationsDir);
    const deploy = deployMigrations(target);
    const history = await historyReport(target);
    const drift = schemaDrift(target.raw, SCHEMA_PATH);
    const ok =
      previousDeploy.code === 0 &&
      previousHistory.appliedCount === expectedPrevious &&
      deploy.code === 0 &&
      history.ok &&
      history.appliedCount === repoMigrations.length &&
      drift.ok;
    return {
      name: `upgrade replay (${expectedPrevious} -> ${repoMigrations.length})`,
      ok,
      detail: `previous=${previousHistory.appliedCount}/${expectedPrevious} final=${history.appliedCount}/${repoMigrations.length} history=${history.ok ? 'OK' : 'FAIL'} drift=${drift.ok ? 'zero' : 'FAIL'}`,
      exit: deploy.code,
      driftReason: drift.reason,
    };
  } finally {
    rmSync(temp.dir, { recursive: true, force: true });
    await dropDisposableDatabase(baseInfo, target.database);
  }
}

export async function driftProof(baseInfo) {
  const target = await createDisposableDatabase(baseInfo, 'drift');
  const temp = tempMigrationsCopy({
    extraMigrationName: '99999999999999_b2a_drift_fixture',
    extraMigrationSql: 'CREATE TABLE "b2a_drift_fixture" ("id" text PRIMARY KEY);\n',
  });
  try {
    const deploy = deployMigrations(target, temp.schemaPath);
    const drift = schemaDrift(target.raw, SCHEMA_PATH);
    return {
      name: 'negative: controlled drift is rejected',
      ok: deploy.code === 0 && drift.ok === false,
      detail: `fixture deploy=${deploy.code} convergence=${drift.ok ? 'OK (unexpected)' : 'FAIL (expected)'}`,
    };
  } finally {
    rmSync(temp.dir, { recursive: true, force: true });
    await dropDisposableDatabase(baseInfo, target.database);
  }
}

export async function checksumProof(baseInfo) {
  const target = await createDisposableDatabase(baseInfo, 'checksum');
  const temp = tempMigrationsCopy();
  try {
    const deploy = deployMigrations(target, temp.schemaPath);
    const lastName = temp.migrations[temp.migrations.length - 1];
    appendFileSync(join(temp.migrationsDir, lastName, 'migration.sql'), '\n-- b2a checksum fixture (temporary copy only)\n');
    const history = await historyReport(target, temp.migrationsDir);
    return {
      name: 'negative: edited applied migration is rejected',
      ok: deploy.code === 0 && history.ok === false && history.checksumMismatch.length > 0,
      detail: `mismatches=${history.checksumMismatch.length} first=${history.checksumMismatch[0]?.name ?? 'none'}`,
    };
  } finally {
    rmSync(temp.dir, { recursive: true, force: true });
    await dropDisposableDatabase(baseInfo, target.database);
  }
}

function urlWithHost(baseInfo, host) {
  const parsed = new URL(baseInfo.raw);
  parsed.hostname = host;
  return parsed.toString();
}

/** Proves the fail-closed guard rejects canonical, shared and production-like targets. */
export function guardProof(baseInfo) {
  const cases = [
    { label: 'canonical database growth_db', url: urlWithDatabase(baseInfo, 'growth_db'), expectFail: true },
    { label: 'non-disposable database name', url: urlWithDatabase(baseInfo, 'growth_prod'), expectFail: true },
    { label: 'production-like host', url: urlWithHost(baseInfo, 'db.prod.example.com'), expectFail: true },
    { label: 'disposable target', url: baseInfo.raw, expectFail: false },
  ];
  return cases.map((entry) => {
    let accepted = true;
    let message = 'accepted';
    try {
      assertDisposableTarget(entry.url, { role: 'test' });
    } catch (error) {
      accepted = false;
      message = error.message;
    }
    return {
      name: `negative: guard ${entry.expectFail ? 'rejects' : 'accepts'} ${entry.label}`,
      ok: accepted !== entry.expectFail,
      detail: entry.expectFail ? (accepted ? 'accepted (unexpected)' : 'rejected (expected)') : message,
    };
  });
}

/** Proves the 63 byte object-name rule fails on a fixture and passes on the real repository. */
export function objectNameProof() {
  const real = objectNameAudit(SCHEMA_PATH, { migrationsDir: MIGRATIONS_DIR });
  const fixtureDir = mkdtempSync(join(tmpdir(), 'b2a-object-names-'));
  const migrationsDir = join(fixtureDir, 'migrations');
  const migrationName = '20260101000000_b2a_long_name_fixture';
  mkdirSync(join(migrationsDir, migrationName), { recursive: true });
  // Reproduces the historical failure class: a migration SQL identifier that
  // PostgreSQL would truncate to 63 bytes (Prisma does not validate these).
  writeFileSync(
    join(migrationsDir, migrationName, 'migration.sql'),
    'CREATE INDEX "RecommendationExposure_recommendationType_recommendationId_exposedAt_idx_b2a" ON "Fixture"("column");\n',
    'utf8'
  );
  const fixture = objectNameAudit(SCHEMA_PATH, { migrationsDir });
  rmSync(fixtureDir, { recursive: true, force: true });
  return [
    {
      name: 'object names: repository schema and migrations stay within 63 bytes',
      ok: real.ok,
      detail: `${real.reason} (legacy exemptions=${real.exempt.length})`,
    },
    {
      name: 'negative: 76 byte migration identifier is rejected',
      ok: fixture.ok === false && fixture.overlong.length >= 1,
      detail: `detected=${fixture.overlong[0]?.bytes ?? 0} bytes (${fixture.overlong[0]?.name ?? 'none'})`,
    },
  ];
}

/**
 * PR-B2B DB-6 proofs. Deterministic and database-free: the repository's own
 * migrations provide the applied history, so every status (and both fail-closed
 * paths) is exercised without touching any database.
 */
export function fingerprintProof() {
  const repo = readRepoMigrations(MIGRATIONS_DIR);
  const finishedAt = '2026-09-19T00:00:00.000Z';
  const applied = repo.map((row) => ({
    name: row.name,
    checksum: row.checksums.lf,
    finishedAt,
    rolledBackAt: null,
  }));
  const unknownRow = {
    name: '20260101000000_b2b_unknown_fixture',
    checksum: 'a'.repeat(64),
    finishedAt,
    rolledBackAt: null,
  };
  const disposableTarget = describeTargetSafety(
    'postgresql://postgres:postgres@localhost:5432/growth_test_fingerprint_b2b?schema=public',
    { env: { NODE_ENV: 'test' } }
  );
  const productionTarget = describeTargetSafety('postgresql://postgres:postgres@localhost:5432/growth_db?schema=public', {
    env: { NODE_ENV: 'production' },
  });
  const cases = [
    { label: 'repository history against itself', expected: 'IN_SYNC', expectOk: true, target: disposableTarget, rows: applied },
    { label: 'last repository migration not applied', expected: 'BEHIND', expectOk: true, target: disposableTarget, rows: applied.slice(0, -1) },
    { label: 'database ahead of the repository', expected: 'AHEAD', expectOk: true, target: disposableTarget, rows: [...applied, unknownRow] },
    { label: 'unknown and missing in both directions', expected: 'DIVERGED', expectOk: false, target: disposableTarget, rows: [...applied.slice(0, -1), unknownRow] },
    {
      label: 'rewritten applied migration',
      expected: 'DIVERGED',
      expectOk: false,
      target: disposableTarget,
      rows: applied.map((row, index) => (index === 0 ? { ...row, checksum: 'b'.repeat(64) } : row)),
    },
    {
      label: 'rolled-back applied migration',
      expected: 'DIVERGED',
      expectOk: false,
      target: disposableTarget,
      rows: applied.map((row, index) => (index === 0 ? { ...row, rolledBackAt: finishedAt } : row)),
    },
    { label: 'unreadable history on a disposable target', expected: 'UNKNOWN', expectOk: true, target: disposableTarget, error: 'connect failed (fixture)' },
    { label: 'unreadable history on a production-like target', expected: 'UNKNOWN', expectOk: false, target: productionTarget, error: 'connect failed (fixture)' },
  ];
  return cases.map((entry) => {
    const history = entry.error ? { rows: null, error: entry.error } : { rows: entry.rows, error: null };
    const report = classifyFingerprint({ ...entry.target, history, repoMigrations: repo });
    return {
      name: `fingerprint: ${entry.label} -> ${entry.expected}`,
      ok: report.status === entry.expected && report.ok === entry.expectOk,
      detail: `status=${report.status} ok=${report.ok} (${report.reason})`,
    };
  });
}

/** PR-B2B DB-7 proofs: destructive schema pushes are refused on shared/production-like targets. */
export function dbPushProof(baseInfo) {
  const disposable = baseInfo.raw;
  const cases = [
    { label: '--accept-data-loss on a production-like target', url: urlWithDatabase(baseInfo, 'growth_prod'), env: { NODE_ENV: 'production' }, args: ['--accept-data-loss'], expectFail: true },
    { label: 'db push without flags on a production-like host', url: urlWithHost(baseInfo, 'db.prod.example.com'), env: { NODE_ENV: 'development' }, args: [], expectFail: true },
    { label: '--accept-data-loss on a shared local database', url: urlWithDatabase(baseInfo, 'growth_prod'), env: { NODE_ENV: 'development' }, args: ['--accept-data-loss'], expectFail: true },
    { label: '--force-reset on a shared local database', url: urlWithDatabase(baseInfo, 'growth_features'), env: { NODE_ENV: 'development' }, args: ['--force-reset'], expectFail: true },
    { label: '--accept-data-loss on a dedicated disposable target', url: disposable, env: { NODE_ENV: 'test' }, args: ['--accept-data-loss'], expectFail: false },
    { label: 'db push without flags on a dedicated disposable target', url: disposable, env: { NODE_ENV: 'test' }, args: [], expectFail: false },
  ];
  return cases.map((entry) => {
    let accepted = true;
    let message = 'allowed';
    try {
      assertDbPushAllowed({ url: entry.url, args: entry.args, env: entry.env });
    } catch (error) {
      accepted = false;
      message = error.message;
    }
    return {
      name: `negative: db push guard ${entry.expectFail ? 'refuses' : 'allows'} ${entry.label}`,
      ok: accepted !== entry.expectFail,
      detail: entry.expectFail ? (accepted ? 'allowed (unexpected)' : 'refused (expected)') : message,
    };
  });
}

/** Replays migrations through a dedicated disposable shadow target, then compares to the schema. */
export async function shadowProof(baseInfo) {
  const target = await createDisposableDatabase(baseInfo, 'shadow');
  try {
    const result = shadowConvergence(target.raw, MIGRATIONS_DIR, SCHEMA_PATH);
    return {
      name: 'migrations -> dedicated shadow target -> Prisma schema',
      ok: result.ok,
      detail: result.reason,
    };
  } finally {
    await dropDisposableDatabase(baseInfo, target.database);
  }
}

function printResults(results) {
  for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name}${result.detail ? ` - ${result.detail}` : ''}`);
  const failed = results.filter((result) => !result.ok).length;
  console.log(failed === 0 ? `B2A RESULT: PASS (${results.length} checks)` : `B2A RESULT: FAIL (${failed}/${results.length})`);
  return failed === 0 ? 0 : 1;
}

async function main() {
  loadEnvFile();
  const [command] = process.argv.slice(2);
  const base = baseTargetUrl();
  if (command === 'fresh') return printResults([await freshReplay(base)]);
  if (command === 'upgrade') return printResults([await upgradeReplay(base)]);
  if (command === 'shadow') return printResults([await shadowProof(base)]);
  if (command === 'negative-proof') {
    const results = [
      ...guardProof(base),
      ...objectNameProof(),
      ...fingerprintProof(),
      ...dbPushProof(base),
      await driftProof(base),
      await checksumProof(base),
    ];
    return printResults(results);
  }
  if (command === 'gate') {
    const results = [
      await freshReplay(base),
      await upgradeReplay(base),
      await shadowProof(base),
      ...guardProof(base),
      ...objectNameProof(),
      ...fingerprintProof(),
      ...dbPushProof(base),
      await driftProof(base),
      await checksumProof(base),
    ];
    return printResults(results);
  }
  console.error('usage: db-replay.mjs <fresh|upgrade|negative-proof|gate>');
  return 2;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(`B2A_FAIL: ${error.message}`);
      process.exit(1);
    });
}
