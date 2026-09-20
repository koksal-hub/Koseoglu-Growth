import { isIP } from 'node:net';
import { z } from 'zod';

const webhookSecretSchema = z
  .string()
  .regex(/^whsec_[A-Za-z0-9+/]+={0,2}$/)
  .refine((value) => Buffer.from(value.slice('whsec_'.length), 'base64').length >= 16, {
    message: 'must decode to at least 16 bytes',
  });

/**
 * `SETTING=` in an env file means "not configured" for optional numeric
 * settings: z.coerce.number('') is 0, which would silently pick the smallest
 * possible value (see PORT below for the original case).
 */
const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export const envSchema = z
  .object({
    DATABASE_URL: z.string().nonempty(),
    // An empty PORT (e.g. PORT= in .env) must fall back to the default:
    // z.coerce.number('') is 0, which would silently bind an ephemeral port.
    PORT: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.coerce.number().int().min(0).default(3000)
    ),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    /**
     * Bind address. Syntax only: a literal IP address, never a hostname.
     * The default (127.0.0.1 in development/test) and the production requirement
     * are owned by exposure-policy.ts, which also decides whether a non-loopback
     * bind is allowed at all.
     */
    HOST: z
      .string()
      .refine((value) => isIP(value) !== 0, { message: 'must be a literal IPv4 or IPv6 address' })
      .optional(),
    /** Explicit permission required before any non-loopback bind is accepted. */
    ALLOW_EXTERNAL_BIND: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    /**
     * Trusted reverse-proxy allowlist (comma separated IP/CIDR). Empty means no
     * proxy is trusted, so X-Forwarded-* headers are never treated as client
     * identity. Parsing and validation live in exposure-policy.ts.
     */
    TRUST_PROXY_CIDRS: z.string().default(''),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    /** Comma-separated allowlist of origins allowed to call the API cross-origin. */
    CORS_ORIGINS: z.string().default(''),
    /**
     * PR-D5 (SYS-12) connection budget contract. Equation:
     *   apiInstances x (DB_POOL_MAX + readiness pool max 1)
     *     + workerInstances x workerPoolMax
     *     + mcpInstances x mcpPoolMax  <=  GROWTH_DB_CONNECTION_BUDGET
     * Worker and MCP own 0 connections while they are inactive. Development and
     * test fall back to the documented single-instance defaults (owned by
     * lib/db-pools.ts); production must state the three marked values
     * explicitly, see the superRefine below.
     */
    API_INSTANCES: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(1).max(64).optional()
    ),
    DB_POOL_MAX: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(64).optional()),
    GROWTH_DB_CONNECTION_BUDGET: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(2).max(4096).optional()
    ),
    DB_POOL_CONNECTION_TIMEOUT_MS: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(100).max(60000).optional()
    ),
    DB_POOL_IDLE_TIMEOUT_MS: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(1000).max(600000).optional()
    ),
    /** Server-side bound: PostgreSQL terminates the query itself. */
    DB_STATEMENT_TIMEOUT_MS: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(100).max(60000).optional()
    ),
    /** Client-side backstop: deliberately larger than the statement timeout. */
    DB_QUERY_TIMEOUT_MS: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(200).max(60000).optional()
    ),
    DB_TRANSACTION_MAX_WAIT_MS: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(100).max(60000).optional()
    ),
    DB_TRANSACTION_TIMEOUT_MS: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(100).max(600000).optional()
    ),
    /**
     * Shared internal boundary for business routes; never log or return it.
     * An empty value means "not configured", not "configured but invalid":
     * `GROWTH_INTERNAL_API_KEY=` in an env file and a compose `:-` default both
     * produce "" and would otherwise fail the length rule in every environment,
     * including development. Production stays fail-closed through the
     * superRefine check below.
     */
    GROWTH_INTERNAL_API_KEY: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z
        .string()
        .min(32)
        .max(256)
        .regex(/^[A-Za-z0-9._~+/=-]+$/)
        .optional()
    ),
    /** Provider calls are disabled unless both this mode and the explicit gate are enabled. */
    EMAIL_PROVIDER_MODE: z.enum(['DISABLED', 'RESEND_TEST']).default('DISABLED'),
    OUTREACH_TEST_DISPATCH_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    RESEND_API_KEY: z
      .string()
      .regex(/^re_[A-Za-z0-9_]+$/)
      .optional(),
    RESEND_WEBHOOK_SECRET: webhookSecretSchema.optional(),
    EMAIL_FROM_ADDRESS: z.string().email().optional(),
  })
  .superRefine((value, context) => {
    // Exposure contract (PR-D1): production must name its bind address
    // explicitly, and an ephemeral port is a test-only convenience.
    if (value.NODE_ENV === 'production' && !value.HOST) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['HOST'],
        message: 'must be set explicitly in production',
      });
    }
    if (value.PORT === 0 && value.NODE_ENV !== 'test') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PORT'],
        message: 'must be greater than 0 outside the test environment',
      });
    }
    if (value.NODE_ENV === 'production' && !value.GROWTH_INTERNAL_API_KEY) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GROWTH_INTERNAL_API_KEY'],
        message: 'is required in production',
      });
    }
    // PR-D5 (SYS-12): a production capacity claim needs the process count, the
    // business pool size and the Growth connection budget as explicit values.
    // They are never inferred from a default, and the live host value stays
    // unverified until it is measured (`SHOW max_connections`).
    if (value.NODE_ENV === 'production') {
      for (const name of ['API_INSTANCES', 'DB_POOL_MAX', 'GROWTH_DB_CONNECTION_BUDGET'] as const) {
        if (value[name] === undefined) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [name],
            message: 'is required in production',
          });
        }
      }
    }
    if (!value.OUTREACH_TEST_DISPATCH_ENABLED) return;
    if (value.EMAIL_PROVIDER_MODE !== 'RESEND_TEST') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['EMAIL_PROVIDER_MODE'],
        message: 'must be RESEND_TEST when test dispatch is enabled',
      });
    }
    if (!value.RESEND_API_KEY) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RESEND_API_KEY'],
        message: 'is required when test dispatch is enabled',
      });
    }
    if (!value.EMAIL_FROM_ADDRESS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['EMAIL_FROM_ADDRESS'],
        message: 'is required when test dispatch is enabled',
      });
    }
    if (!value.RESEND_WEBHOOK_SECRET) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RESEND_WEBHOOK_SECRET'],
        message: 'is required when test dispatch is enabled',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: NodeJS.ProcessEnv): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    // print errors to console (no secrets) and throw
    // keep message generic
    console.error('Missing or invalid environment variables:', parsed.error.format());
    throw new Error('Environment validation failed');
  }
  return parsed.data;
}

/**
 * Validated DATABASE_URL for modules (e.g. the Prisma client) that need the
 * connection string before/without building the full server. Fails fast with
 * a clear error instead of silently falling back to an empty string.
 */
export function requireDatabaseUrl(raw: NodeJS.ProcessEnv): string {
  const url = raw.DATABASE_URL;
  if (!url || url.trim().length === 0) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env and configure it before starting the API.'
    );
  }
  return url;
}
