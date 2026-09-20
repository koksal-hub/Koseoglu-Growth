import { afterAll, describe, expect, it } from 'vitest';
import {
  checkReadiness,
  createPool,
  drainPool,
  READINESS_BUDGET_MS,
  resolveDbSettings,
} from '../src/lib/db-pools';
import { validateEnv } from '../src/plugins/env';

// Port 1 refuses connections immediately, so the bounded-readiness behaviour can
// be proven without a database: the answer must still arrive inside the budget.
const UNREACHABLE_URL = 'postgresql://postgres:postgres@127.0.0.1:1/growth_test_unreachable?schema=public';

const settings = resolveDbSettings(validateEnv({ DATABASE_URL: UNREACHABLE_URL }));
const pool = createPool('readiness', UNREACHABLE_URL, settings.readiness);

afterAll(async () => {
  await drainPool(pool);
});

describe('PR-D5 bounded readiness (SYS-3)', () => {
  it('answers with a bounded failure when the database is unreachable', async () => {
    const started = Date.now();
    const result = await checkReadiness(pool, READINESS_BUDGET_MS);
    const elapsedMs = Date.now() - started;

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('an unreachable database must never report ready');
    expect(result.reason).toBe('database unreachable');
    // The failure is explained for the log (never for the HTTP body).
    expect(result.detail.length).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThanOrEqual(READINESS_BUDGET_MS);
  });

  it('drains idempotently and tolerates a missing pool', async () => {
    const throwaway = createPool('readiness', UNREACHABLE_URL, settings.readiness);
    await drainPool(throwaway);
    await expect(drainPool(throwaway)).resolves.toBeUndefined();
    await expect(drainPool(null)).resolves.toBeUndefined();
  });
});
