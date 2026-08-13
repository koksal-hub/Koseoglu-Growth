import { z } from 'zod';

export const envSchema = z.object({
  DATABASE_URL: z.string().nonempty(),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  /** Comma-separated allowlist of origins allowed to call the API cross-origin. */
  CORS_ORIGINS: z.string().default('')
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
