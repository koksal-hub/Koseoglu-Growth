#!/usr/bin/env node
/**
 * PR-B2A database safety gate (DB-2/DB-3/DB-4/DB-5/DB-9).
 *
 * Design rules honoured by this module:
 *  - Every target must pass a fail-closed disposable-target guard BEFORE any
 *    command touches it (dedicated disposable database, never canonical/shared
 *    or production-like).
 *  - Repo migration history is immutable: this module never writes to
 *    prisma/migrations. Negative fixtures are built in temporary copies.
 *  - No new dependencies: `pg` is already an API dependency.
 *
 * CLI:
 *   node apps/api/scripts/db-safety.mjs guard --url <url> [--role shadow|test]
 *   node apps/api/scripts/db-safety.mjs history --url <url> [--migrations-dir dir]
 *   node apps/api/scripts/db-safety.mjs convergence --url <url> [--schema path]
 *   node apps/api/scripts/db-safety.mjs shadow-convergence [--schema path]
 *   node apps/api/scripts/db-safety.mjs object-names [--schema path]
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pg from 'pg';

export const OBJECT_NAME_LIMIT = 63;
/** A target is only usable when its database name carries an explicit disposable segment. */
export const DISPOSABLE_PATTERN = /(^|[_-])(test|tests|ci|sandbox|shadow|b2a)([_-]|$)/i;
export const FORBIDDEN_DATABASE_NAMES = new Set(['growth_db', 'postgres', 'template0', 'template1']);
export const DEFAULT_SAFE_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'db', 'postgres']);

export class DbSafetyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DbSafetyError';
  }
}

export function repoRoot() {
  return resolve(new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
}

export function parseDatabaseUrl(raw) {
  if (!raw || typeof raw !== 'string') throw new DbSafetyError('database url is required');
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new DbSafetyError('database url is not a valid URL');
  }
  if (!['postgresql:', 'postgres:'].includes(parsed.protocol)) {
    throw new DbSafetyError(`database url must be postgresql (got ${parsed.protocol})`);
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (database.length === 0) throw new DbSafetyError('database url has no database name');
  return {
    raw,
    host: parsed.hostname,
    port: parsed.port || '5432',
    database,
    schema: parsed.searchParams.get('schema') || 'public',
  };
}

/**
 * Fail-closed guard. Throws unless the target is a dedicated disposable
 * database on a known-local host. `ALLOW_NON_LOCAL_DB_TARGET=1` is the only
 * escape hatch and must be set explicitly per shell (never in CI config).
 */
export function assertDisposableTarget(raw, options = {}) {
  const role = options.role ?? 'test';
  const info = parseDatabaseUrl(raw);
  const allowedHosts = new Set([
    ...DEFAULT_SAFE_HOSTS,
    ...(process.env.B2A_ALLOWED_DB_HOSTS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  ]);
  if (FORBIDDEN_DATABASE_NAMES.has(info.database.toLowerCase())) {
    throw new DbSafetyError(
      `refusing canonical/maintenance database "${info.database}": ${role} targets must be dedicated and disposable`
    );
  }
  if (!DISPOSABLE_PATTERN.test(info.database)) {
    throw new DbSafetyError(
      `refusing database "${info.database}": name must contain a test/ci/sandbox/shadow/b2a segment (role=${role})`
    );
  }
  if (!allowedHosts.has(info.host) && process.env.ALLOW_NON_LOCAL_DB_TARGET !== '1') {
    throw new DbSafetyError(
      `refusing host "${info.host}": only known-local hosts are allowed unless ALLOW_NON_LOCAL_DB_TARGET=1`
    );
  }
  if (
    role === 'shadow' &&
    !info.schema.toLowerCase().startsWith('b2a_shadow') &&
    !info.database.toLowerCase().includes('_b2a_shadow')
  ) {
    throw new DbSafetyError(
      `refusing shadow target "${info.database}"/"${info.schema}": a shadow target needs its own dedicated name (b2a_shadow schema or *_b2a_shadow* database)`
    );
  }
  return info;
}

function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Prisma records the sha256 of the migration bytes it read at apply time, so a
 * Windows CRLF checkout and a Linux LF checkout produce different digests for
 * the same content. Both variants are exact hashes of the repository file, so
 * accepting either keeps the check meaningful (any real edit changes both)
 * while staying portable.
 */
export function sha256Variants(bytes) {
  const asStored = sha256Hex(bytes);
  const text = bytes.toString('utf8');
  const lf = sha256Hex(Buffer.from(text.replace(/\r\n/g, '\n'), 'utf8'));
  const crlf = sha256Hex(Buffer.from(text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'), 'utf8'));
  return { asStored, lf, crlf };
}

export function readRepoMigrations(migrationsDir) {
  if (!existsSync(migrationsDir)) throw new DbSafetyError(`migrations directory not found: ${migrationsDir}`);
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const sqlPath = join(migrationsDir, entry.name, 'migration.sql');
      const bytes = readFileSync(sqlPath);
      return { name: entry.name, sqlPath, checksums: sha256Variants(bytes) };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function readAppliedMigrations(rawUrl) {
  const info = assertDisposableTarget(rawUrl, { role: 'test' });
  const client = new pg.Client({ connectionString: info.raw });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT migration_name, checksum, finished_at, rolled_back_at
         FROM "${info.schema}"."_prisma_migrations"
        ORDER BY migration_name`
    );
    return rows.map((row) => ({
      name: row.migration_name,
      checksum: row.checksum ?? null,
      finishedAt: row.finished_at ?? null,
      rolledBackAt: row.rolled_back_at ?? null,
    }));
  } finally {
    await client.end();
  }
}

/**
 * Classifies repository migrations against the database history.
 * missing  = in repo, not applied          -> forward work pending
 * unknown  = applied, not in repo          -> DIVERGED (repo cannot explain the DB)
 * mismatch = applied checksum edited later -> historical migration was rewritten
 */
export function classifyHistory(applied, repoMigrations) {
  const appliedByName = new Map(applied.map((row) => [row.name, row]));
  const repoByName = new Map(repoMigrations.map((row) => [row.name, row]));
  const missing = repoMigrations.filter((row) => !appliedByName.has(row.name)).map((row) => row.name);
  const unknown = applied.filter((row) => !repoByName.has(row.name)).map((row) => row.name);
  const checksumMismatch = [];
  let matchedVariant = { asStored: 0, lf: 0, crlf: 0 };
  for (const repo of repoMigrations) {
    const appliedRow = appliedByName.get(repo.name);
    if (!appliedRow || appliedRow.checksum === null || appliedRow.rolledBackAt !== null) continue;
    const variants = repo.checksums;
    const match = ['asStored', 'lf', 'crlf'].find((key) => variants[key] === appliedRow.checksum);
    if (match) matchedVariant[match] += 1;
    else checksumMismatch.push({ name: repo.name, appliedChecksum: appliedRow.checksum, repoChecksums: variants });
  }
  return {
    ok: missing.length === 0 && unknown.length === 0 && checksumMismatch.length === 0,
    appliedCount: applied.length,
    repoCount: repoMigrations.length,
    missing,
    unknown,
    checksumMismatch,
    matchedVariant,
  };
}

export function extractMappedNames(schemaText) {
  const names = [];
  for (const match of schemaText.matchAll(/map:\s*"([^"]+)"/g)) names.push(match[1]);
  return names;
}

export function extractGeneratedNames(ddl) {
  const names = [];
  for (const match of ddl.matchAll(/(?:CREATE (?:UNIQUE )?INDEX|ADD CONSTRAINT|CONSTRAINT)\s+"([^"]+)"/g)) {
    names.push(match[1]);
  }
  return names;
}

export function overlongNames(names) {
  const seen = new Set();
  const overlong = [];
  for (const name of names) {
    if (seen.has(name)) continue;
    seen.add(name);
    const bytes = Buffer.byteLength(name, 'utf8');
    if (bytes > OBJECT_NAME_LIMIT) overlong.push({ name, bytes });
  }
  return overlong.sort((left, right) => right.bytes - left.bytes);
}

/**
 * Historical migrations may carry identifiers PostgreSQL truncated when they were
 * applied. They are immutable, so each such name must be listed here together
 * with the forward migration that resolved it - no silent exemptions.
 */
export const LEGACY_MIGRATION_NAME_ALLOWLIST = new Map([
  [
    'RecommendationExposure_recommendationType_recommendationId_exposedAt_idx',
    'applied by 20260902030000_add_recommendation_measurement_receipts and renamed forward to rec_exposure_lookup_idx by 20260919130000_pin_recommendation_exposure_index_name (PR-C)',
  ],
  [
    'CommunicationPermission_contactPointId_channel_purpose_jurisdictionCountry_idx',
    'applied by 20260901085500_add_contact_permission_gate; PostgreSQL truncated it to CommunicationPermission_contactPointId_channel_purpose_jurisdic (63 bytes), which is the name pinned in prisma/schema.prisma and present in every replayed database (surfaced by this gate, zero drift verified by the convergence layer)',
  ],
]);

/** Names physically created by migration SQL (Prisma does not validate these). */
export function extractMigrationNames(sqlText) {
  const names = [];
  const push = (value) => {
    if (typeof value === 'string' && value.length > 0) names.push(value);
  };
  for (const match of sqlText.matchAll(/CREATE (?:UNIQUE )?INDEX\s+(?:IF NOT EXISTS\s+)?"([^"]+)"/g)) push(match[1]);
  for (const match of sqlText.matchAll(/ALTER INDEX\s+(?:IF EXISTS\s+)?"([^"]+)"\s+RENAME TO\s+"([^"]+)"/g)) {
    push(match[1]);
    push(match[2]);
  }
  for (const match of sqlText.matchAll(/ADD CONSTRAINT\s+"([^"]+)"/g)) push(match[1]);
  return names;
}

export function migrationObjectNameAudit(migrationsDir, allowlist = LEGACY_MIGRATION_NAME_ALLOWLIST) {
  const overlong = [];
  const exempt = [];
  let checked = 0;
  for (const migration of readRepoMigrations(migrationsDir)) {
    const sql = readFileSync(migration.sqlPath, 'utf8');
    for (const name of new Set(extractMigrationNames(sql))) {
      checked += 1;
      const bytes = Buffer.byteLength(name, 'utf8');
      if (bytes <= OBJECT_NAME_LIMIT) continue;
      const reason = allowlist.get(name);
      if (reason) exempt.push({ name, bytes, migration: migration.name, reason });
      else overlong.push({ name, bytes, migration: migration.name });
    }
  }
  return { checked, overlong, exempt };
}

/**
 * Prefers the Prisma CLI entry point over the node_modules/.bin shim: on
 * Windows a `.cmd` shim is not executable through execFileSync without a shell,
 * and shell quoting would break paths containing spaces.
 */
export function prismaEntry(root = repoRoot()) {
  const cli = join(root, 'node_modules', 'prisma', 'build', 'index.js');
  if (existsSync(cli)) return { command: process.execPath, prefix: [cli], shell: false };
  const shim = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'prisma.cmd' : 'prisma');
  return { command: shim, prefix: [], shell: process.platform === 'win32' };
}

export function runPrisma(args, options = {}) {
  const root = options.cwd ?? repoRoot();
  const entry = prismaEntry(root);
  try {
    const stdout = execFileSync(entry.command, [...entry.prefix, ...args], {
      cwd: root,
      env: { ...process.env, ...(options.env ?? {}) },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: entry.shell,
    });
    return { code: 0, stdout, stderr: '' };
  } catch (error) {
    return {
      code: typeof error.status === 'number' ? error.status : 1,
      stdout: error.stdout?.toString() ?? '',
      stderr: error.stderr?.toString() ?? String(error.message),
    };
  }
}

/** Strips prisma's comment-only output so an empty diff is recognisable. */
export function isEffectivelyEmptySql(script) {
  return script
    .split(/\r?\n/)
    .map((line) => line.trim())
    .every((line) => line.length === 0 || line.startsWith('--'));
}

export function schemaDrift(rawUrl, schemaPath) {
  const info = assertDisposableTarget(rawUrl, { role: 'target' });
  const result = runPrisma(['migrate', 'diff', '--from-config-datasource', '--to-schema', schemaPath, '--script'], {
    env: { DATABASE_URL: info.raw },
  });
  if (result.code !== 0) {
    return { ok: false, script: result.stdout, reason: `migrate diff failed: ${result.stderr.trim()}` };
  }
  return {
    ok: isEffectivelyEmptySql(result.stdout),
    script: result.stdout,
    reason: isEffectivelyEmptySql(result.stdout) ? 'zero unexpected drift' : 'database differs from Prisma schema',
  };
}

export function shadowConvergence(shadowUrl, migrationsDir, schemaPath) {
  const info = assertDisposableTarget(shadowUrl, { role: 'shadow' });
  const result = runPrisma(
    ['migrate', 'diff', '--from-migrations', migrationsDir, '--to-schema', schemaPath, '--script'],
    { env: { DATABASE_URL: info.raw, SHADOW_DATABASE_URL: info.raw } }
  );
  if (result.code !== 0) {
    return { ok: false, script: result.stdout, reason: `shadow convergence failed: ${result.stderr.trim()}` };
  }
  return {
    ok: isEffectivelyEmptySql(result.stdout),
    script: result.stdout,
    reason: isEffectivelyEmptySql(result.stdout)
      ? 'migrations converge to the Prisma schema through the shadow target'
      : 'migrations do not converge to the Prisma schema',
  };
}

export function objectNameAudit(schemaPath, options = {}) {
  const schemaText = readFileSync(schemaPath, 'utf8');
  const mapped = extractMappedNames(schemaText);
  const ddl = runPrisma(['migrate', 'diff', '--from-empty', '--to-schema', schemaPath, '--script']);
  const generated = ddl.code === 0 ? extractGeneratedNames(ddl.stdout) : [];
  const migrations = options.migrationsDir
    ? migrationObjectNameAudit(options.migrationsDir, options.allowlist)
    : { checked: 0, overlong: [], exempt: [] };
  const overlong = [
    ...overlongNames([...mapped, ...generated]),
    ...migrations.overlong.map((row) => ({ name: row.name, bytes: row.bytes, source: `migration ${row.migration}` })),
  ];
  const schemaFailed = ddl.code !== 0;
  return {
    ok: !schemaFailed && overlong.length === 0,
    mapped,
    generated,
    migrationsChecked: migrations.checked,
    exempt: migrations.exempt,
    overlong,
    reason: schemaFailed
      ? `migrate diff failed: ${ddl.stderr.trim()}`
      : overlong.length === 0
        ? `all schema and migration identifiers are <= ${OBJECT_NAME_LIMIT} bytes`
        : 'identifiers would be silently truncated by PostgreSQL',
  };
}

function argValue(args, name, fallback) {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) return args[index + 1];
  return fallback;
}

export function resolveTargetUrl(args) {
  return argValue(args, '--url', process.env.SHADOW_DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const root = repoRoot();
  const schemaPath = resolve(root, argValue(args, '--schema', 'prisma/schema.prisma'));
  const migrationsDir = resolve(root, argValue(args, '--migrations-dir', 'prisma/migrations'));

  switch (command) {
    case 'guard': {
      const role = argValue(args, '--role', 'test');
      const info = assertDisposableTarget(resolveTargetUrl(args), { role });
      console.log(`GUARD OK role=${role} host=${info.host} database=${info.database} schema=${info.schema}`);
      return 0;
    }
    case 'history': {
      const appliedJson = argValue(args, '--applied-json', null);
      const applied = appliedJson
        ? JSON.parse(readFileSync(appliedJson, 'utf8'))
        : await readAppliedMigrations(resolveTargetUrl(args));
      if (appliedJson) console.log(`offline history fixture: ${appliedJson}`);
      const repo = readRepoMigrations(migrationsDir);
      const report = classifyHistory(applied, repo);
      console.log(`applied=${report.appliedCount} repo=${report.repoCount}`);
      console.log(`checksum-variant matches: asStored=${report.matchedVariant.asStored} lf=${report.matchedVariant.lf} crlf=${report.matchedVariant.crlf}`);
      if (report.missing.length > 0) console.log(`MISSING (repo only): ${report.missing.join(', ')}`);
      if (report.unknown.length > 0) console.log(`UNKNOWN (db only): ${report.unknown.join(', ')}`);
      for (const row of report.checksumMismatch) {
        console.log(`CHECKSUM MISMATCH: ${row.name} applied=${row.appliedChecksum?.slice(0, 16)} repo=${row.repoChecksums.lf.slice(0, 16)}`);
      }
      console.log(report.ok ? 'HISTORY OK' : 'HISTORY FAIL');
      return report.ok ? 0 : 1;
    }
    case 'convergence': {
      const drift = schemaDrift(resolveTargetUrl(args), schemaPath);
      console.log(`convergence: ${drift.ok ? 'OK' : 'FAIL'} (${drift.reason})`);
      if (!drift.ok) console.log(drift.script.trim());
      return drift.ok ? 0 : 1;
    }
    case 'shadow-convergence': {
      const shadowUrl = process.env.SHADOW_DATABASE_URL;
      if (!shadowUrl) throw new DbSafetyError('SHADOW_DATABASE_URL is required (fail-closed)');
      const result = shadowConvergence(shadowUrl, migrationsDir, schemaPath);
      console.log(`shadow convergence: ${result.ok ? 'OK' : 'FAIL'} (${result.reason})`);
      if (!result.ok) console.log(result.script.trim());
      return result.ok ? 0 : 1;
    }
    case 'object-names': {
      const audit = objectNameAudit(schemaPath, { migrationsDir });
      console.log(
        `object names checked: mapped=${audit.mapped.length} generated=${audit.generated.length} migration-names=${audit.migrationsChecked}`
      );
      for (const row of audit.exempt) console.log(`LEGACY EXEMPT (${row.bytes} bytes, ${row.migration}): ${row.name}`);
      for (const row of audit.overlong) {
        console.log(`OVERLONG (${row.bytes} bytes${row.source ? `, ${row.source}` : ''}): ${row.name}`);
      }
      console.log(audit.ok ? `OBJECT NAMES OK - ${audit.reason}` : `OBJECT NAMES FAIL - ${audit.reason}`);
      return audit.ok ? 0 : 1;
    }
    default:
      console.error(
        'usage: db-safety.mjs <guard|history|convergence|shadow-convergence|object-names> [--url url] [--schema path] [--migrations-dir dir] [--role test|shadow|target]'
      );
      return 2;
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(`DB_SAFETY_FAIL: ${error.message}`);
      process.exit(1);
    });
}
