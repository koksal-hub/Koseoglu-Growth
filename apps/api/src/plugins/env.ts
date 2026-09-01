import { z } from 'zod';

const webhookSecretSchema = z
  .string()
  .regex(/^whsec_[A-Za-z0-9+/]+={0,2}$/)
  .refine((value) => Buffer.from(value.slice('whsec_'.length), 'base64').length >= 16, {
    message: 'must decode to at least 16 bytes',
  });

export const envSchema = z
  .object({
    DATABASE_URL: z.string().nonempty(),
    PORT: z.coerce.number().int().positive().default(3000),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    /** Comma-separated allowlist of origins allowed to call the API cross-origin. */
    CORS_ORIGINS: z.string().default(''),
    /** Shared internal boundary for business routes; never log or return it. */
    GROWTH_INTERNAL_API_KEY: z
      .string()
      .min(32)
      .max(256)
      .regex(/^[A-Za-z0-9._~+/=-]+$/)
      .optional(),
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
    if (value.NODE_ENV === 'production' && !value.GROWTH_INTERNAL_API_KEY) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GROWTH_INTERNAL_API_KEY'],
        message: 'is required in production',
      });
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
