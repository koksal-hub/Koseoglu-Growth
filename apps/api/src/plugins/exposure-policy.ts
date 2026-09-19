import { isIP } from 'node:net';
import type { Env } from './env';

/**
 * PR-D1 exposure contract (SYS-1) and trusted proxy policy (SYS-2).
 *
 * Single owner for two questions: "where may this process listen?" and "whose
 * forwarded headers may we believe?". Environment syntax (PORT semantics, HOST
 * must be a literal IP, the production key requirement) stays in env.ts; this
 * module owns the decisions and is called from buildServer(), so a violation
 * fails the startup instead of silently exposing the API.
 *
 * `trustProxy: true` and hop counting are deliberately not supported: only an
 * explicit CIDR allowlist may be trusted, and an empty list means no forwarded
 * header is ever treated as client identity.
 */

export class ExposurePolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExposurePolicyError';
  }
}

export type BindScope = 'LOOPBACK' | 'EXTERNAL';

/** BC5 evidence: typed, startup-only, non-persistent, secret-free. */
export type ExposureEvidence = {
  host: string;
  port: number;
  bindScope: BindScope;
  externalBindExplicitlyAllowed: boolean;
  trustProxyEnabled: boolean;
  trustedProxyCount: number;
  nodeEnv: Env['NODE_ENV'];
};

export type ExposurePolicy = {
  host: string;
  port: number;
  bindScope: BindScope;
  externalBindExplicitlyAllowed: boolean;
  trustProxyEnabled: boolean;
  trustedProxyCount: number;
  /** Fastify `trustProxy` value: false, or the validated CIDR allowlist. */
  trustProxy: false | string[];
  evidence: ExposureEvidence;
};

function isLoopbackAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return address.startsWith('127.');
  if (version === 6) {
    const normalized = address.toLowerCase();
    return normalized === '::1' || normalized === '0:0:0:0:0:0:0:1';
  }
  return false;
}

/**
 * Parses the comma separated trusted-proxy allowlist. Fail-closed: a hostname,
 * a malformed address, an out-of-range or zero-length prefix, an empty segment
 * or a world route (0.0.0.0/0, ::/0) is rejected instead of being trusted.
 * Duplicates are removed deterministically while the given order is preserved.
 */
export function parseTrustedProxyAllowlist(raw: string | undefined): string[] {
  const trimmed = (raw ?? '').trim();
  if (trimmed.length === 0) return [];
  const allowlist: string[] = [];
  const seen = new Set<string>();
  for (const segment of trimmed.split(',')) {
    const entry = segment.trim();
    if (entry.length === 0) {
      throw new ExposurePolicyError('TRUST_PROXY_CIDRS contains an empty entry');
    }
    const parts = entry.split('/');
    if (parts.length > 2) {
      throw new ExposurePolicyError(`TRUST_PROXY_CIDRS entry "${entry}" is not a valid IP or CIDR`);
    }
    const [address, prefix] = parts;
    const version = isIP(address);
    if (version === 0) {
      throw new ExposurePolicyError(
        `TRUST_PROXY_CIDRS entry "${entry}" is not a literal IP or CIDR (hostnames are never trusted)`
      );
    }
    if (prefix !== undefined) {
      const bits = Number(prefix);
      const maxBits = version === 4 ? 32 : 128;
      if (!/^\d+$/.test(prefix) || !Number.isInteger(bits) || bits < 1 || bits > maxBits) {
        throw new ExposurePolicyError(`TRUST_PROXY_CIDRS entry "${entry}" has an invalid prefix length`);
      }
    }
    const canonical = prefix === undefined ? address : `${address}/${Number(prefix)}`;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    allowlist.push(canonical);
  }
  return allowlist;
}

/**
 * Resolves the bind address and the trusted proxy policy, or throws
 * ExposurePolicyError when the configuration would expose the API without
 * explicit permission.
 */
export function resolveExposurePolicy(
  env: Pick<Env, 'NODE_ENV' | 'PORT' | 'HOST' | 'ALLOW_EXTERNAL_BIND' | 'TRUST_PROXY_CIDRS'>
): ExposurePolicy {
  const productionLike = env.NODE_ENV === 'production';
  const host = env.HOST ?? (productionLike ? undefined : '127.0.0.1');
  if (!host) {
    throw new ExposurePolicyError('HOST must be set explicitly in production (fail-closed)');
  }
  const bindScope: BindScope = isLoopbackAddress(host) ? 'LOOPBACK' : 'EXTERNAL';
  if (bindScope === 'EXTERNAL' && !env.ALLOW_EXTERNAL_BIND) {
    throw new ExposurePolicyError(
      `refusing non-loopback bind ${host}: set ALLOW_EXTERNAL_BIND=true to allow it (authentication stays required)`
    );
  }
  const allowlist = parseTrustedProxyAllowlist(env.TRUST_PROXY_CIDRS);
  const trustProxy: false | string[] = allowlist.length > 0 ? allowlist : false;
  const evidence: ExposureEvidence = {
    host,
    port: env.PORT,
    bindScope,
    externalBindExplicitlyAllowed: env.ALLOW_EXTERNAL_BIND,
    trustProxyEnabled: trustProxy !== false,
    trustedProxyCount: allowlist.length,
    nodeEnv: env.NODE_ENV,
  };
  return {
    host,
    port: env.PORT,
    bindScope,
    externalBindExplicitlyAllowed: env.ALLOW_EXTERNAL_BIND,
    trustProxyEnabled: trustProxy !== false,
    trustedProxyCount: allowlist.length,
    trustProxy,
    evidence,
  };
}
