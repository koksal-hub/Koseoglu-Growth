import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/growth_db?schema=public',
      NODE_ENV: 'test'
    }
  }
});
