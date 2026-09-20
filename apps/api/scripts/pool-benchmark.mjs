#!/usr/bin/env node
/**
 * Read-only pool benchmark (PR-D5 / DELTA-06, SYS-12).
 *
 * What it does:
 *  - refuses to run unless the target is a dedicated, disposable, known-local
 *    database (same fail-closed guard the migration tooling uses);
 *  - reports `SHOW max_connections` and `SHOW superuser_reserved_connections`
 *    (live production values stay unverified until measured on the live host);
 *  - measures candidate business pool sizes with `SELECT 1` and a controlled
 *    `pg_sleep`, printing throughput, p50/p95/p99 plus error/timeout counts;
 *  - verifies the PR-D5 capacity equation and exits non-zero when it fails.
 *
 * What it never does: write data, run migrations or touch a shared database.
 * Every session is opened with `default_transaction_read_only=on`, and only
 * `SELECT 1` / `SELECT pg_sleep(...)` statement shapes are issued.
 *
 * Usage (from the repository root):
 *   node apps/api/scripts/pool-benchmark.mjs --url "$TEST_DATABASE_URL" \
 *     --candidates 1,2,3,5,8 --queries 40 --sleep-ms 25
 */

import { Pool } from 'pg';
import { assertDisposableTarget, describeTargetSafety } from './db-safety.mjs';

const READINESS_POOL_MAX = 1; // mirrors apps/api/src/lib/db-pools.ts
const DEFAULT_CANDIDATES = [1, 2, 3, 4, 5, 8];
const DEFAULT_QUERIES = 40;
const DEFAULT_SLEEP_MS = 25;
const DEFAULT_CONCURRENCY = 8;

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const match = /^--([a-z-]+)(?:=(.*))?$/.exec(argv[index]);
    if (!match) continue;
    const [, name, inline] = match;
    if (inline !== undefined) {
      args[name] = inline;
      continue;
    }
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      args[name] = next;
      index += 1;
      continue;
    }
    args[name] = 'true';
  }
  return args;
}

function percentile(sorted, ratio) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(ratio * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function readServerCapacity(url) {
  const pool = new Pool({ connectionString: url, max: 1, application_name: 'growth-benchmark-admin' });
  try {
    const max = await pool.query('SHOW max_connections');
    const reserved = await pool.query('SHOW superuser_reserved_connections');
    return {
      maxConnections: Number(max.rows[0].max_connections),
      superuserReserved: Number(reserved.rows[0].superuser_reserved_connections),
    };
  } finally {
    await pool.end();
  }
}

async function measureCandidate({ url, candidate, queries, sleepMs, concurrency }) {
  const pool = new Pool({
    connectionString: url,
    max: candidate,
    application_name: 'growth-benchmark',
    connectionTimeoutMillis: 2000,
    statement_timeout: 2000,
    query_timeout: 3000,
    // Hard safety net: this session cannot write, whatever the SQL says.
    options: '-c default_transaction_read_only=on',
  });

  const latencies = [];
  let errors = 0;
  let timeouts = 0;
  const started = Date.now();

  // Concurrency is deliberately independent of the pool size: otherwise a bigger
  // pool simply means more parallel callers and throughput always looks better,
  // which cannot show at which size the workload is actually served.
  const worker = async (workerIndex) => {
    for (let round = 0; round < queries; round += 1) {
      const useSleep = (round + workerIndex) % 8 === 7;
      const text = useSleep ? 'SELECT pg_sleep($1)' : 'SELECT 1';
      const values = useSleep ? [sleepMs / 1000] : [];
      const queryStarted = Date.now();
      try {
        await pool.query(text, values);
        latencies.push(Date.now() - queryStarted);
      } catch (error) {
        errors += 1;
        if (/timeout|terminating connection/i.test(String(error?.message ?? ''))) timeouts += 1;
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index)));
  } finally {
    await pool.end();
  }

  const elapsedMs = Date.now() - started;
  const sorted = [...latencies].sort((a, b) => a - b);
  const totalQueries = concurrency * queries;
  return {
    candidate,
    concurrency,
    totalQueries,
    elapsedMs,
    throughput: elapsedMs === 0 ? 0 : Number(((totalQueries / elapsedMs) * 1000).toFixed(1)),
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    errors,
    timeouts,
  };
}

/**
 * Smallest candidate that keeps throughput within 5% of the best result with no
 * errors and no timeouts: the pool should be as small as the workload allows.
 */
export function selectBusinessPoolMax(results) {
  const clean = results.filter((result) => result.errors === 0 && result.timeouts === 0);
  const pool = clean.length > 0 ? clean : results;
  const best = pool.reduce(
    (winner, result) => (result.throughput > winner.throughput ? result : winner),
    pool[0]
  );
  const adequate = pool
    .filter((result) => result.throughput >= best.throughput * 0.95)
    .sort((a, b) => a.candidate - b.candidate);
  return { chosen: adequate[0] ?? best, best, tolerance: 0.05 };
}

export function evaluateCapacity({ businessPoolMax, apiInstances, connectionBudget }) {
  const required = apiInstances * (businessPoolMax + READINESS_POOL_MAX);
  return { required, budget: connectionBudget, ok: required <= connectionBudget };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = args.url ?? process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url || url === 'true') {
    console.error('FAIL pool-benchmark: a disposable target url is required (--url or TEST_DATABASE_URL)');
    process.exitCode = 1;
    return;
  }

  const safety = describeTargetSafety(url);
  if (!safety.disposable || safety.productionLike) {
    console.error(
      `FAIL pool-benchmark: refusing target ${safety.info.database}@${safety.info.host} (${safety.reasons.join('; ')})`
    );
    process.exitCode = 1;
    return;
  }
  assertDisposableTarget(url, { role: 'test' });

  const candidates = String(args.candidates ?? DEFAULT_CANDIDATES.join(','))
    .split(',')
    .map((value) => positiveInt(value, 0))
    .filter((value) => value > 0);
  const queries = positiveInt(args.queries, DEFAULT_QUERIES);
  const sleepMs = positiveInt(args['sleep-ms'], DEFAULT_SLEEP_MS);
  const concurrency = positiveInt(args.concurrency, DEFAULT_CONCURRENCY);

  const capacity = await readServerCapacity(url);
  console.log('pool-benchmark (read-only)');
  console.log(
    `target=${safety.info.database}@${safety.info.host}:${safety.info.port} schema=${safety.info.schema}`
  );
  console.log(
    `server_max_connections=${capacity.maxConnections} superuser_reserved=${capacity.superuserReserved}`
  );
  console.log(
    `candidates=${candidates.join(',')} concurrency=${concurrency} (fixed, independent of pool size) ` +
      `queries_per_worker=${queries} sleep_ms=${sleepMs}`
  );

  const results = [];
  for (const candidate of candidates) {
    const result = await measureCandidate({ url, candidate, queries, sleepMs, concurrency });
    results.push(result);
    console.log(
      `pool_max=${result.candidate} throughput_qps=${result.throughput} p50=${result.p50}ms p95=${result.p95}ms ` +
        `p99=${result.p99}ms errors=${result.errors} timeouts=${result.timeouts} total=${result.totalQueries}`
    );
  }

  const { chosen, best, tolerance } = selectBusinessPoolMax(results);
  console.log(
    `selection: DB_POOL_MAX=${chosen.candidate} (rule: smallest candidate with zero errors/timeouts and ` +
      `throughput within ${Math.round(tolerance * 100)}% of the best ${best.candidate} -> ${best.throughput} qps)`
  );
  if (chosen.errors > 0 || chosen.timeouts > 0) {
    console.error('FAIL pool-benchmark: no candidate completed without errors or timeouts');
    process.exitCode = 1;
  }

  const apiInstances = positiveInt(process.env.API_INSTANCES, 1);
  const connectionBudget = positiveInt(process.env.GROWTH_DB_CONNECTION_BUDGET, 20);
  const equation = evaluateCapacity({ businessPoolMax: chosen.candidate, apiInstances, connectionBudget });
  console.log(
    `capacity: api_instances=${apiInstances} x (business ${chosen.candidate} + readiness ${READINESS_POOL_MAX}) ` +
      `= required ${equation.required} <= budget ${equation.budget} -> ${equation.ok ? 'PASS' : 'FAIL'}`
  );
  console.log(
    'live production capacity: LIVE_UNVERIFIED (measure SHOW max_connections on the live host before claiming PASS)'
  );
  if (!equation.ok) {
    console.error('FAIL pool-benchmark: connection budget equation failed');
    process.exitCode = 1;
  }
}

// A functional failure (unreachable target, refused target, budget equation)
// must fail the run with a readable message: the script is a hard gate on
// function and capacity, while latency numbers are reported only.
try {
  await main();
} catch (error) {
  console.error(`FAIL pool-benchmark: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
