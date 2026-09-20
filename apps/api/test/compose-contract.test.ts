import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateEnv } from '../src/plugins/env';
import { resolveExposurePolicy } from '../src/plugins/exposure-policy';
import { evaluateCapacity, resolveDbSettings } from '../src/lib/db-pools';
import { captureEnvFailure } from './support/env-failure';

// Regression suite for the docker compose startup contract (PR-D1R).
//
// The api service declared NODE_ENV=production without forwarding HOST,
// ALLOW_EXTERNAL_BIND or GROWTH_INTERNAL_API_KEY, so the container could never
// start: env.ts rejects a production configuration without an explicit HOST and
// an internal key, and exposure-policy.ts refuses a non-loopback bind without
// the explicit permission flag. Container configuration is not covered by the
// application suites, so the contract is pinned here.
//
// The compose file is read as text on purpose: this repository does not depend
// on a YAML parser and the suite must run without Docker.

const COMPOSE_FILE = 'docker/docker-compose.yml';

function readComposeFile(): string {
  // `pnpm test` runs from the repository root; the parent walk keeps the test
  // working when a runner starts deeper in the tree.
  let directory = process.cwd();
  for (let depth = 0; depth < 4; depth += 1) {
    const candidate = resolve(directory, COMPOSE_FILE);
    if (existsSync(candidate)) return readFileSync(candidate, 'utf8');
    directory = resolve(directory, '..');
  }
  throw new Error(`${COMPOSE_FILE} was not found starting from ${process.cwd()}`);
}

/** `environment:` entries of one service, exactly as declared in the file. */
function readServiceEnvironment(source: string, service: string): Map<string, string> {
  const lines = source.split('\n');
  const start = lines.indexOf(`  ${service}:`);
  if (start < 0) throw new Error(`${COMPOSE_FILE} has no "${service}" service`);
  const environment = new Map<string, string>();
  let insideEnvironment = false;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
    const indentation = line.length - line.trimStart().length;
    if (indentation <= 2) break; // the next service or a top-level key
    if (indentation === 4) {
      insideEnvironment = trimmed === 'environment:';
      continue;
    }
    if (indentation !== 6 || !insideEnvironment) continue;
    const separator = line.indexOf(':');
    if (separator < 0) throw new Error(`unparseable environment entry: ${trimmed}`);
    environment.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  return environment;
}

/**
 * Compose interpolation default of a forwarded variable: `${NAME:-x}` resolves
 * to the operator's value, or `x` when it is unset. `${NAME}` has no default.
 */
function declaredDefault(environment: Map<string, string>, name: string): string {
  const value = environment.get(name);
  if (value === undefined) throw new Error(`the api service does not forward ${name}`);
  const match = new RegExp(`^\\$\\{${name}(?::-([^}]*))?\\}$`).exec(value);
  if (!match) {
    throw new Error(`${name} must be forwarded through compose interpolation, got "${value}"`);
  }
  return match[1] ?? '';
}

const composeSource = readComposeFile();
const apiEnvironment = readServiceEnvironment(composeSource, 'api');

/** Container environment as compose would build it for a given operator key. */
function containerEnvironment(apiKey: string): NodeJS.ProcessEnv {
  const port = apiEnvironment.get('PORT');
  if (port === undefined) throw new Error('the api service does not set PORT');
  return {
    // Compose owns the container topology; the interpolation tokens inside the
    // declared URL are resolved by compose, so a literal target is used here.
    DATABASE_URL: 'postgresql://postgres:postgres@db:5432/growth_db?schema=public',
    PORT: port,
    NODE_ENV: declaredDefault(apiEnvironment, 'NODE_ENV'),
    HOST: declaredDefault(apiEnvironment, 'HOST'),
    ALLOW_EXTERNAL_BIND: declaredDefault(apiEnvironment, 'ALLOW_EXTERNAL_BIND'),
    TRUST_PROXY_CIDRS: declaredDefault(apiEnvironment, 'TRUST_PROXY_CIDRS'),
    GROWTH_INTERNAL_API_KEY: apiKey,
    API_INSTANCES: declaredDefault(apiEnvironment, 'API_INSTANCES'),
    DB_POOL_MAX: declaredDefault(apiEnvironment, 'DB_POOL_MAX'),
    GROWTH_DB_CONNECTION_BUDGET: declaredDefault(apiEnvironment, 'GROWTH_DB_CONNECTION_BUDGET'),
  };
}

describe('docker compose api startup contract', () => {
  it('forwards every exposure variable the API validates at startup', () => {
    for (const name of [
      'HOST',
      'ALLOW_EXTERNAL_BIND',
      'TRUST_PROXY_CIDRS',
      'GROWTH_INTERNAL_API_KEY',
    ]) {
      expect(apiEnvironment.has(name)).toBe(true);
    }
  });

  it('keeps the production posture without inventing a secret', () => {
    expect(declaredDefault(apiEnvironment, 'NODE_ENV')).toBe('production');
    // No fabricated key: empty means "the operator must provide one".
    expect(declaredDefault(apiEnvironment, 'GROWTH_INTERNAL_API_KEY')).toBe('');
    expect(composeSource).toContain('GROWTH_INTERNAL_API_KEY: ${GROWTH_INTERNAL_API_KEY');
  });

  it('declares the container bind scope and keeps proxies opt-in', () => {
    expect(declaredDefault(apiEnvironment, 'HOST')).toBe('0.0.0.0');
    expect(declaredDefault(apiEnvironment, 'ALLOW_EXTERNAL_BIND')).toBe('true');
    // An empty allowlist means no forwarded header defines client identity.
    expect(declaredDefault(apiEnvironment, 'TRUST_PROXY_CIDRS')).toBe('');
  });

  it('forwards the PR-D5 capacity inputs and keeps the equation satisfied', () => {
    // Production requires these explicitly (env.ts), so the container must pass
    // them; the declared values must also fit the reviewed budget.
    expect(declaredDefault(apiEnvironment, 'API_INSTANCES')).toBe('1');
    expect(declaredDefault(apiEnvironment, 'DB_POOL_MAX')).toBe('5');
    expect(declaredDefault(apiEnvironment, 'GROWTH_DB_CONNECTION_BUDGET')).toBe('20');

    const settings = resolveDbSettings(validateEnv(containerEnvironment('A'.repeat(43))));
    const report = evaluateCapacity(settings);
    expect(report.required).toBe(6);
    expect(report.verdict).toBe('PASS');
    expect(report.liveVerified).toBe(false);
  });

  it('publishes the api port on the loopback interface only', () => {
    expect(composeSource).toMatch(/^\s+- "127\.0\.0\.1:3000:3000"$/m);
    expect(composeSource).not.toMatch(/^\s+- "3000:3000"$/m);
  });

  it('produces a configuration the API accepts and exposes deliberately', () => {
    const env = validateEnv(containerEnvironment('A'.repeat(43)));
    expect(env.NODE_ENV).toBe('production');
    expect(env.HOST).toBe('0.0.0.0');
    expect(env.ALLOW_EXTERNAL_BIND).toBe(true);
    expect(resolveExposurePolicy(env).bindScope).toBe('EXTERNAL');
  });

  it('starts in development without a key and stays closed in production', () => {
    // The compose `:-` default forwards an empty string. Development must treat
    // it as "not configured" and start, while the production default above must
    // still refuse to start with a reason that names the missing key.
    const development = validateEnv({ ...containerEnvironment(''), NODE_ENV: 'development' });
    expect(development.GROWTH_INTERNAL_API_KEY).toBeUndefined();
    expect(captureEnvFailure(containerEnvironment(''))).toContain('is required in production');
  });
});
