import path from 'node:path';

type LoadEnvFile = (filePath: string) => void;

/** process.loadEnvFile exists since Node v20.12/v21.7; read it defensively for older @types/node. */
function readLoadEnvFile(): LoadEnvFile | undefined {
  const candidate = (process as unknown as { loadEnvFile?: LoadEnvFile }).loadEnvFile;
  return typeof candidate === 'function' ? candidate : undefined;
}

/** Test runners must never pick up a developer .env (it can flip auth/provider gates). */
export function shouldAutoLoadEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== 'test' && env.VITEST !== 'true';
}

/**
 * Load the repository-root .env for local development and `pnpm start`.
 *
 * - `pnpm --filter` runs package scripts with cwd = apps/api, so a plain
 *   cwd-based loader misses the documented root .env.
 * - Resolving from __dirname works from src (ts-node-dev) and from dist.
 * - A missing file is a no-op (docker/CI inject real environment variables).
 * - Values already present in the real environment are never overridden
 *   (process.loadEnvFile keeps existing keys; verified in tests).
 * - No dependency: this replaces the previous `dotenv` usage.
 */
export function bootstrapEnv(repoRoot = path.resolve(__dirname, '..', '..', '..')): boolean {
  const loadEnvFile = readLoadEnvFile();
  if (!loadEnvFile) return false;
  try {
    loadEnvFile(path.join(repoRoot, '.env'));
    return true;
  } catch {
    return false;
  }
}

// Imported first by src/index.ts so the root .env is present before any other
// module (e.g. lib/prisma.ts) reads process.env. Skipped under test runners.
if (shouldAutoLoadEnv()) {
  bootstrapEnv();
}