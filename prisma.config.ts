import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
    // PR-B2A: `prisma migrate diff --from-migrations` needs a shadow target.
    // Deliberately read straight from the environment (undefined when unset) so
    // no command fails merely because a shadow URL is not configured; whenever
    // one is used, apps/api/scripts/db-safety.mjs enforces the fail-closed
    // disposable-target guard before it is touched.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL
  }
});
