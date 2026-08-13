import { z } from 'zod';

export const envSchema = z.object({
  DATABASE_URL: z.string().nonempty(),
  PORT: z.string().default('3000'),
  NODE_ENV: z.string().default('development')
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
