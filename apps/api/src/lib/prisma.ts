import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { requireDatabaseUrl, validateEnv } from '../plugins/env';
import {
  createPool,
  drainPool,
  evaluateCapacity,
  resolveDbSettings,
  type CapacityReport,
} from './db-pools';

/**
 * PR-D5 (SYS-12): the business pool is configured explicitly instead of letting
 * Prisma create an unbounded internal pool. The capacity equation is evaluated
 * before a single connection is opened: an over-budget configuration fails the
 * startup (fail-closed) rather than exhausting PostgreSQL later.
 */
const settings = resolveDbSettings(validateEnv(process.env));

/** Startup capacity evidence (non-persistent, secret-free). */
export const capacityReport: CapacityReport = evaluateCapacity(settings);
if (!capacityReport.ok) {
  throw new Error(
    `database connection budget exceeded (fail-closed): required=${capacityReport.required} ` +
      `budget=${capacityReport.budget} apiInstances=${capacityReport.apiInstances} ` +
      `DB_POOL_MAX=${settings.business.max} readinessPoolMax=${settings.readiness.max}`
  );
}

/** Business pool: shared by every Prisma query in this process. */
export const businessPool = createPool('business', requireDatabaseUrl(process.env), settings.business);

const adapter = new PrismaPg(businessPool, { disposeExternalPool: true });

export const prisma = new PrismaClient({
  adapter,
  transactionOptions: {
    maxWait: settings.transaction.maxWaitMs,
    timeout: settings.transaction.timeoutMs,
  },
});

let disconnected = false;

/**
 * Idempotent shutdown: Prisma disconnects and disposes the external business
 * pool (`disposeExternalPool: true`), and `drainPool` never ends a pool twice.
 */
export async function disconnectDatabase(): Promise<void> {
  if (disconnected) return;
  disconnected = true;
  await prisma.$disconnect();
  await drainPool(businessPool);
}
