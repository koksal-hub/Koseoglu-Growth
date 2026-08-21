import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

// Single source of truth for the test DATABASE_URL is .env.test — see that
// file's comment. CI loads the same file into $GITHUB_ENV (ci.yml).
// quiet: true suppresses dotenv's unrelated promotional console "tips".
config({ path: '.env.test', quiet: true });

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: process.env.DATABASE_URL,
      NODE_ENV: 'test'
    }
  }
});
