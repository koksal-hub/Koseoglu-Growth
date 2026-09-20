import { describe, expect, it } from 'vitest';
import { validateEnv } from '../src/plugins/env';
import {
  buildPoolConfig,
  DbPoolConfigError,
  DEFAULT_BUSINESS_POOL_MAX,
  evaluateCapacity,
  READINESS_BUDGET_MS,
  READINESS_CONNECT_TIMEOUT_MS,
  READINESS_POOL_MAX,
  READINESS_QUERY_TIMEOUT_MS,
  READINESS_STATEMENT_TIMEOUT_MS,
  resolveDbSettings,
} from '../src/lib/db-pools';
import { captureEnvFailure } from './support/env-failure';

const DATABASE_URL = 'postgresql://example.invalid/growth_test';

describe('PR-D5 connection budget (SYS-12)', () => {
  it('defaults to a single instance with the documented development values', () => {
    const settings = resolveDbSettings(validateEnv({ DATABASE_URL }));
    expect(settings.apiInstances).toBe(1);
    expect(settings.business.max).toBe(DEFAULT_BUSINESS_POOL_MAX);
    expect(settings.readiness.max).toBe(READINESS_POOL_MAX);
    expect(settings.transaction).toEqual({ maxWaitMs: 2000, timeoutMs: 5000 });
  });

  it('evaluates api x (business + readiness) and keeps inactive processes at zero', () => {
    const settings = resolveDbSettings(
      validateEnv({
        DATABASE_URL,
        API_INSTANCES: '2',
        DB_POOL_MAX: '5',
        GROWTH_DB_CONNECTION_BUDGET: '12',
      })
    );
    const report = evaluateCapacity(settings);
    expect(report.apiConnections).toBe(12);
    expect(report.workerConnections).toBe(0);
    expect(report.mcpConnections).toBe(0);
    expect(report.required).toBe(12);
    expect(report.budget).toBe(12);
    expect(report.verdict).toBe('PASS');
    // A local run never claims that production capacity was verified.
    expect(report.liveVerified).toBe(false);
    expect(report.liveMaxConnections).toBeNull();
  });

  it('fails closed when the budget cannot cover both pools of every instance', () => {
    const settings = resolveDbSettings(
      validateEnv({
        DATABASE_URL,
        API_INSTANCES: '2',
        DB_POOL_MAX: '5',
        GROWTH_DB_CONNECTION_BUDGET: '11',
      })
    );
    const report = evaluateCapacity(settings);
    expect(report.required).toBe(12);
    expect(report.verdict).toBe('FAIL');
    expect(report.ok).toBe(false);
  });

  it('requires the capacity inputs explicitly in production', () => {
    const production = {
      DATABASE_URL,
      NODE_ENV: 'production',
      HOST: '0.0.0.0',
      GROWTH_INTERNAL_API_KEY: 'A'.repeat(43),
    };
    const report = captureEnvFailure(production);
    for (const name of ['API_INSTANCES', 'DB_POOL_MAX', 'GROWTH_DB_CONNECTION_BUDGET']) {
      expect(report).toContain(name);
    }
    expect(report).toContain('is required in production');
    // An empty value is "not set" for these numeric settings too.
    expect(
      captureEnvFailure({ ...production, API_INSTANCES: '', DB_POOL_MAX: '', GROWTH_DB_CONNECTION_BUDGET: '' })
    ).toContain('is required in production');

    const configured = validateEnv({
      ...production,
      API_INSTANCES: '1',
      DB_POOL_MAX: '5',
      GROWTH_DB_CONNECTION_BUDGET: '12',
    });
    expect(resolveDbSettings(configured).connectionBudget).toBe(12);
  });

  it('maps the reviewed timeouts onto pg.PoolConfig, server-side bound first', () => {
    const settings = resolveDbSettings(validateEnv({ DATABASE_URL }));
    const readiness = buildPoolConfig('readiness', DATABASE_URL, settings.readiness);
    expect(readiness.max).toBe(READINESS_POOL_MAX);
    expect(readiness.statement_timeout).toBe(READINESS_STATEMENT_TIMEOUT_MS);
    expect(readiness.query_timeout).toBe(READINESS_QUERY_TIMEOUT_MS);
    expect(readiness.connectionTimeoutMillis).toBe(READINESS_CONNECT_TIMEOUT_MS);
    // A readiness probe cannot write, even if a future edit adds a query.
    expect(readiness.options).toContain('default_transaction_read_only=on');
    expect(READINESS_STATEMENT_TIMEOUT_MS).toBeLessThan(READINESS_QUERY_TIMEOUT_MS);
    expect(READINESS_CONNECT_TIMEOUT_MS + READINESS_STATEMENT_TIMEOUT_MS).toBeLessThan(READINESS_BUDGET_MS);

    const business = buildPoolConfig('business', DATABASE_URL, settings.business);
    expect(business.max).toBe(DEFAULT_BUSINESS_POOL_MAX);
    expect(business.options).toBeUndefined();
    expect(Number(business.statement_timeout)).toBeLessThan(Number(business.query_timeout));
  });

  it('rejects a configuration where the client could abandon a running query', () => {
    expect(() => resolveDbSettings(validateEnv({ DATABASE_URL, DB_STATEMENT_TIMEOUT_MS: '7000' }))).toThrow(
      DbPoolConfigError
    );
  });
});
