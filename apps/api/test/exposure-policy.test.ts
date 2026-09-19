import { describe, expect, it } from 'vitest';
import {
  ExposurePolicyError,
  parseTrustedProxyAllowlist,
  resolveExposurePolicy
} from '../src/plugins/exposure-policy';

type PolicyEnv = {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  HOST: string | undefined;
  ALLOW_EXTERNAL_BIND: boolean;
  TRUST_PROXY_CIDRS: string;
};

function env(overrides: Partial<PolicyEnv> = {}): PolicyEnv {
  return {
    NODE_ENV: 'development',
    PORT: 3000,
    HOST: undefined,
    ALLOW_EXTERNAL_BIND: false,
    TRUST_PROXY_CIDRS: '',
    ...overrides
  };
}

function rejection(raw: string): unknown {
  try {
    parseTrustedProxyAllowlist(raw);
    return null;
  } catch (thrown) {
    return thrown;
  }
}

describe('PR-D1 exposure policy (SYS-1)', () => {
  it('defaults development and test binds to loopback', () => {
    for (const nodeEnv of ['development', 'test'] as const) {
      const policy = resolveExposurePolicy(env({ NODE_ENV: nodeEnv }));
      expect(policy.host).toBe('127.0.0.1');
      expect(policy.bindScope).toBe('LOOPBACK');
      expect(policy.externalBindExplicitlyAllowed).toBe(false);
      expect(policy.evidence.nodeEnv).toBe(nodeEnv);
    }
  });

  it('fails closed in production without an explicit HOST', () => {
    expect(() => resolveExposurePolicy(env({ NODE_ENV: 'production' }))).toThrow(ExposurePolicyError);
    expect(() => resolveExposurePolicy(env({ NODE_ENV: 'production' }))).toThrow(/HOST must be set explicitly/);
  });

  it('refuses a non-loopback bind unless the permission flag is explicit', () => {
    for (const host of ['0.0.0.0', '::', '192.168.1.10']) {
      expect(() => resolveExposurePolicy(env({ HOST: host }))).toThrow(/ALLOW_EXTERNAL_BIND=true/);

      const allowed = resolveExposurePolicy(env({ NODE_ENV: 'production', HOST: host, ALLOW_EXTERNAL_BIND: true }));
      expect(allowed.bindScope).toBe('EXTERNAL');
      expect(allowed.host).toBe(host);
      expect(allowed.externalBindExplicitlyAllowed).toBe(true);
      expect(allowed.evidence.bindScope).toBe('EXTERNAL');
    }
  });

  it('classifies every 127/8 address and ::1 as loopback', () => {
    for (const host of ['127.0.0.1', '127.1.2.3', '::1']) {
      const policy = resolveExposurePolicy(env({ HOST: host }));
      expect(policy.bindScope).toBe('LOOPBACK');
      expect(policy.host).toBe(host);
    }
  });
});

describe('PR-D1 trusted proxy policy (SYS-2)', () => {
  it('trusts no proxy when the allowlist is empty', () => {
    for (const raw of ['', '   ']) {
      const policy = resolveExposurePolicy(env({ TRUST_PROXY_CIDRS: raw }));
      expect(policy.trustProxy).toBe(false);
      expect(policy.trustProxyEnabled).toBe(false);
      expect(policy.trustedProxyCount).toBe(0);
    }
  });

  it('rejects world routes, hostnames, empty entries and malformed prefixes', () => {
    const rejected = [
      '0.0.0.0/0',
      '::/0',
      '10.0.0.0/0',
      'proxy.internal',
      '10.0.0.0/33',
      '10.0.0.0/abc',
      '10.0.0.0/-1',
      '10.0.0.1/8/9',
      'not-an-ip',
      '127.0.0.1,'
    ];
    for (const raw of rejected) {
      expect(rejection(raw), `expected "${raw}" to be rejected`).toBeInstanceOf(ExposurePolicyError);
    }
    expect(() => parseTrustedProxyAllowlist('127.0.0.1,')).toThrow(/empty entry/);
  });

  it('accepts single and multiple CIDRs deterministically', () => {
    expect(parseTrustedProxyAllowlist('127.0.0.1/32')).toEqual(['127.0.0.1/32']);
    expect(parseTrustedProxyAllowlist(' 10.0.0.0/8 , 172.16.0.0/12,::1/128 ')).toEqual([
      '10.0.0.0/8',
      '172.16.0.0/12',
      '::1/128'
    ]);
    // duplicates collapse while the given order is preserved
    expect(parseTrustedProxyAllowlist('172.16.0.0/12,10.0.0.0/8,172.16.0.0/12')).toEqual([
      '172.16.0.0/12',
      '10.0.0.0/8'
    ]);

    const policy = resolveExposurePolicy(env({ TRUST_PROXY_CIDRS: '10.0.0.0/8,172.16.0.0/12' }));
    expect(policy.trustProxy).toEqual(['10.0.0.0/8', '172.16.0.0/12']);
    expect(policy.trustProxyEnabled).toBe(true);
    expect(policy.trustedProxyCount).toBe(2);
  });

  it('never yields a blind trust flag or a hop count', () => {
    const policy = resolveExposurePolicy(env({ TRUST_PROXY_CIDRS: '10.0.0.0/8' }));
    expect(policy.trustProxy).not.toBe(true);
    expect(typeof policy.trustProxy).not.toBe('number');
    expect(Array.isArray(policy.trustProxy)).toBe(true);
  });

  it('reports secret-free startup evidence without the cidr list (BC5)', () => {
    const policy = resolveExposurePolicy(
      env({
        NODE_ENV: 'production',
        PORT: 8080,
        HOST: '10.0.0.5',
        ALLOW_EXTERNAL_BIND: true,
        TRUST_PROXY_CIDRS: '10.0.0.0/8'
      })
    );

    expect(policy.evidence).toEqual({
      host: '10.0.0.5',
      port: 8080,
      bindScope: 'EXTERNAL',
      externalBindExplicitlyAllowed: true,
      trustProxyEnabled: true,
      trustedProxyCount: 1,
      nodeEnv: 'production'
    });
    expect(JSON.stringify(policy.evidence)).not.toContain('10.0.0.0/8');
  });
});