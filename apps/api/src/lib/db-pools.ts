import { Pool, type PoolClient, type PoolConfig } from 'pg';
import { requireDatabaseUrl, validateEnv, type Env } from '../plugins/env';

/**
 * PR-D5 / DELTA-06 (SYS-12 + SYS-3): connection budget, explicit pool/timeout
 * configuration and bounded readiness.
 *
 * The decisions in this file are pure (they take a validated env in and return
 * settings), so the capacity equation and the timeout ordering can be tested
 * without a database. The pools themselves are thin wrappers around `pg`.
 *
 * Reviewed decisions (2026-09-20):
 *  - one API instance, worker and MCP are inactive and therefore own 0
 *    connections (`0 / NOT_ACTIVE`); activating the worker (L2) requires its own
 *    mandatory pool budget gate before it may connect;
 *  - readiness uses a dedicated, strictly bounded pool (max = 1);
 *  - server-side `statement_timeout` (1000 ms) fires before the client-side
 *    `query_timeout` (1250 ms) so a stuck query is terminated inside PostgreSQL
 *    instead of being abandoned by the API, and both stay under the readiness
 *    budget (2000 ms) together with the connect timeout (750 ms).
 */

export const READINESS_POOL_MAX = 1;
export const READINESS_BUDGET_MS = 2000;
export const READINESS_CONNECT_TIMEOUT_MS = 750;
export const READINESS_STATEMENT_TIMEOUT_MS = 1000;
export const READINESS_QUERY_TIMEOUT_MS = 1250;

/** Not started yet: a future activation must bring its own budget gate. */
export const WORKER_INSTANCES = 0;
export const MCP_INSTANCES = 0;
export const WORKER_POOL_MAX = 0;
export const MCP_POOL_MAX = 0;

export type PoolRole = 'business' | 'readiness';

export type PoolSettings = {
  max: number;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
  statementTimeoutMs: number;
  queryTimeoutMs: number;
};

export type DbSettings = {
  connectionString: string;
  apiInstances: number;
  connectionBudget: number;
  business: PoolSettings;
  readiness: PoolSettings;
  transaction: { maxWaitMs: number; timeoutMs: number };
};

export type CapacityReport = {
  verdict: 'PASS' | 'FAIL';
  ok: boolean;
  required: number;
  budget: number;
  apiInstances: number;
  apiConnections: number;
  workerConnections: number;
  mcpConnections: number;
  /** Production capacity stays unverified until it is measured on the live host. */
  liveVerified: false;
  /** `SHOW max_connections` has not been read for production. */
  liveMaxConnections: null;
};

/** Documented single-instance defaults for development/test (never production). */
export const DEFAULT_API_INSTANCES = 1;
export const DEFAULT_BUSINESS_POOL_MAX = 5;
export const DEFAULT_CONNECTION_BUDGET = 20;
export const DEFAULT_CONNECT_TIMEOUT_MS = 2000;
export const DEFAULT_IDLE_TIMEOUT_MS = 30000;
export const DEFAULT_STATEMENT_TIMEOUT_MS = 5000;
export const DEFAULT_QUERY_TIMEOUT_MS = 6000;
export const DEFAULT_TRANSACTION_MAX_WAIT_MS = 2000;
export const DEFAULT_TRANSACTION_TIMEOUT_MS = 5000;

export class DbPoolConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DbPoolConfigError';
  }
}

/**
 * A timeout ordering that is impossible to violate silently:
 *  - server-side statement_timeout < client-side query_timeout, so PostgreSQL
 *    terminates the query itself and no orphan query is left behind;
 *  - readiness connect + statement stay inside the readiness budget.
 */
function assertTimeoutOrdering(settings: DbSettings): void {
  const pools: Array<[string, PoolSettings]> = [
    ['business', settings.business],
    ['readiness', settings.readiness],
  ];
  for (const [name, pool] of pools) {
    if (pool.statementTimeoutMs >= pool.queryTimeoutMs) {
      throw new DbPoolConfigError(
        `${name} pool: DB_STATEMENT_TIMEOUT_MS (${pool.statementTimeoutMs}) must be smaller than ` +
          `DB_QUERY_TIMEOUT_MS (${pool.queryTimeoutMs}) so PostgreSQL cancels the query first`
      );
    }
  }
  const readinessWorstCase = settings.readiness.connectionTimeoutMillis + settings.readiness.statementTimeoutMs;
  if (readinessWorstCase >= READINESS_BUDGET_MS) {
    throw new DbPoolConfigError(
      `readiness timeouts (connect + statement = ${readinessWorstCase} ms) must stay below the ` +
        `${READINESS_BUDGET_MS} ms readiness budget`
    );
  }
}

export function resolveDbSettings(env: Env): DbSettings {
  const settings: DbSettings = {
    connectionString: env.DATABASE_URL,
    apiInstances: env.API_INSTANCES ?? DEFAULT_API_INSTANCES,
    connectionBudget: env.GROWTH_DB_CONNECTION_BUDGET ?? DEFAULT_CONNECTION_BUDGET,
    business: {
      max: env.DB_POOL_MAX ?? DEFAULT_BUSINESS_POOL_MAX,
      connectionTimeoutMillis: env.DB_POOL_CONNECTION_TIMEOUT_MS ?? DEFAULT_CONNECT_TIMEOUT_MS,
      idleTimeoutMillis: env.DB_POOL_IDLE_TIMEOUT_MS ?? DEFAULT_IDLE_TIMEOUT_MS,
      statementTimeoutMs: env.DB_STATEMENT_TIMEOUT_MS ?? DEFAULT_STATEMENT_TIMEOUT_MS,
      queryTimeoutMs: env.DB_QUERY_TIMEOUT_MS ?? DEFAULT_QUERY_TIMEOUT_MS,
    },
    readiness: {
      max: READINESS_POOL_MAX,
      connectionTimeoutMillis: READINESS_CONNECT_TIMEOUT_MS,
      idleTimeoutMillis: env.DB_POOL_IDLE_TIMEOUT_MS ?? DEFAULT_IDLE_TIMEOUT_MS,
      statementTimeoutMs: READINESS_STATEMENT_TIMEOUT_MS,
      queryTimeoutMs: READINESS_QUERY_TIMEOUT_MS,
    },
    transaction: {
      maxWaitMs: env.DB_TRANSACTION_MAX_WAIT_MS ?? DEFAULT_TRANSACTION_MAX_WAIT_MS,
      timeoutMs: env.DB_TRANSACTION_TIMEOUT_MS ?? DEFAULT_TRANSACTION_TIMEOUT_MS,
    },
  };
  assertTimeoutOrdering(settings);
  return settings;
}

/**
 * `required = apiInstances x (businessPoolMax + readinessPoolMax)
 *            + workerInstances x workerPoolMax
 *            + mcpInstances x mcpPoolMax`
 *
 * The process count is the number of processes that may connect, not the number
 * of requests: every instance keeps both its business and readiness pool.
 */
export function evaluateCapacity(settings: DbSettings): CapacityReport {
  const apiConnections = settings.apiInstances * (settings.business.max + settings.readiness.max);
  const workerConnections = WORKER_INSTANCES * WORKER_POOL_MAX;
  const mcpConnections = MCP_INSTANCES * MCP_POOL_MAX;
  const required = apiConnections + workerConnections + mcpConnections;
  const ok = required <= settings.connectionBudget;
  return {
    verdict: ok ? 'PASS' : 'FAIL',
    ok,
    required,
    budget: settings.connectionBudget,
    apiInstances: settings.apiInstances,
    apiConnections,
    workerConnections,
    mcpConnections,
    liveVerified: false,
    liveMaxConnections: null,
  };
}

/**
 * Maps reviewed settings onto `pg.PoolConfig`. Timeouts are pool-level: no
 * per-request `SET statement_timeout` is issued anywhere.
 */
export function buildPoolConfig(role: PoolRole, connectionString: string, settings: PoolSettings): PoolConfig {
  return {
    connectionString,
    application_name: `growth-${role}`,
    max: settings.max,
    connectionTimeoutMillis: settings.connectionTimeoutMillis,
    idleTimeoutMillis: settings.idleTimeoutMillis,
    statement_timeout: settings.statementTimeoutMs,
    query_timeout: settings.queryTimeoutMs,
    // The readiness pool must never write, not even if a future edit adds a
    // query: the session itself is read only.
    ...(role === 'readiness' ? { options: '-c default_transaction_read_only=on' } : {}),
  };
}

export function createPool(role: PoolRole, connectionString: string, settings: PoolSettings): Pool {
  return new Pool(buildPoolConfig(role, connectionString, settings));
}

let readinessPool: Pool | null = null;

/** Dedicated readiness pool; created once per process and reused. */
export function getReadinessPool(raw: NodeJS.ProcessEnv = process.env): Pool {
  if (readinessPool === null) {
    const settings = resolveDbSettings(validateEnv(raw));
    readinessPool = createPool('readiness', requireDatabaseUrl(raw), settings.readiness);
  }
  return readinessPool;
}

/** Idempotent: a second drain is a no-op instead of an error. */
export async function drainReadinessPool(): Promise<void> {
  const pool = readinessPool;
  readinessPool = null;
  await drainPool(pool);
}

/**
 * Idempotent pool drain. `pg` refuses a second `end()` on the same pool, and
 * the Prisma adapter disposes the business pool itself
 * (`disposeExternalPool: true`), so an already-ending pool is skipped instead of
 * turning a clean shutdown into an error.
 */
export async function drainPool(pool: Pool | null | undefined): Promise<void> {
  if (!pool) return;
  if (pool.ending) return;
  await pool.end();
}

export type ReadinessResult =
  | { ok: true; elapsedMs: number }
  | { ok: false; elapsedMs: number; reason: 'database unreachable'; detail: string };

/**
 * Bounded readiness check on the dedicated read-only pool.
 *
 * The pool timeouts are the mechanism (connect 750 ms, server-side statement
 * timeout 1000 ms, client query timeout 1250 ms) and the budget is the outer
 * invariant: it never replaces the timeouts, it only guarantees the caller gets
 * an answer inside `budgetMs` even if a future edit loosens them. `SELECT 1` is
 * the only statement and the session is read only, so a readiness probe cannot
 * write; no per-request `SET statement_timeout` is issued.
 */
export async function checkReadiness(
  pool: Pool,
  budgetMs: number = READINESS_BUDGET_MS
): Promise<ReadinessResult> {
  const started = Date.now();
  const attempt = async (): Promise<ReadinessResult> => {
    let client: PoolClient | undefined;
    try {
      client = await pool.connect();
      await client.query('SELECT 1');
      return { ok: true, elapsedMs: Date.now() - started };
    } catch (err) {
      return {
        ok: false,
        elapsedMs: Date.now() - started,
        reason: 'database unreachable',
        detail: err instanceof Error ? err.message : String(err),
      };
    } finally {
      // Released as soon as the attempt settles, even when the budget below
      // answered first: the connection is never leaked.
      client?.release();
    }
  };

  let timer: NodeJS.Timeout | undefined;
  const budget = new Promise<ReadinessResult>((resolve) => {
    timer = setTimeout(
      () =>
        resolve({
          ok: false,
          elapsedMs: Date.now() - started,
          reason: 'database unreachable',
          detail: `readiness budget of ${budgetMs} ms exceeded`,
        }),
      budgetMs
    );
    timer.unref();
  });

  const result = await Promise.race([attempt(), budget]);
  if (timer) clearTimeout(timer);
  return result;
}
