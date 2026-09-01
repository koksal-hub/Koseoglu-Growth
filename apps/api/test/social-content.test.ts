import { describe, expect, it } from 'vitest';
import {
  assertIndependentReviewer,
  getSocialAdapter,
  PLATFORM_CONTENT_LIMITS,
  registerSocialAdapter,
  validateSocialVariant,
} from '../src/lib/social-content';

function expectPolicyError(action: () => unknown, statusCode: number) {
  let error: unknown;
  try {
    action();
  } catch (caught) {
    error = caught;
  }
  expect(error).toMatchObject({ statusCode });
}

describe('social content policy and provider registry', () => {
  it('trims a variant and records a versioned deterministic receipt', () => {
    const result = validateSocialVariant({ platform: 'X', body: '  Köseoğlu Logistics  ' });
    expect(result.body).toBe('Köseoğlu Logistics');
    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.validationReceipt).toMatchObject({
      policyVersion: 'social-content-policy-v1',
      platform: 'X',
      bodyLength: 'Köseoğlu Logistics'.length,
      maxCharacters: PLATFORM_CONTENT_LIMITS.X,
      providerValidation: 'NOT_RUN',
    });
  });

  it('enforces the conservative product character policy', () => {
    expect(() => validateSocialVariant({ platform: 'X', body: 'x'.repeat(281) })).toThrow(
      /exceeds the product policy character limit/
    );
    expectPolicyError(() => validateSocialVariant({ platform: 'NOT_A_PLATFORM', body: 'test' }), 400);
  });

  it('rejects credentials and secret-like metadata keys', () => {
    expectPolicyError(
      () =>
        validateSocialVariant({ platform: 'LINKEDIN', body: 'test', mediaManifest: { url: 'sk_test_1234567890abcdef' } }),
      400
    );
    expectPolicyError(
      () =>
        validateSocialVariant({ platform: 'LINKEDIN', body: 'test', mediaManifest: { accessToken: 'not persisted' } }),
      400
    );
  });

  it('keeps adapter execution provider-neutral until an adapter is explicitly registered', () => {
    expectPolicyError(() => getSocialAdapter('PINTEREST'), 503);
    const adapter = {
      platform: 'PINTEREST' as const,
      connect: async () => undefined,
      refreshToken: async () => undefined,
      validateContent: async () => ({ valid: true, reasons: [] }),
      uploadMedia: async () => ({ mediaReference: 'fixture-media' }),
      publish: async () => ({ providerPostId: 'fixture-post' }),
      schedule: async () => ({ providerPostId: 'fixture-post' }),
      delete: async () => undefined,
      fetchPostMetrics: async () => ({ source: 'fixture' }),
      fetchComments: async () => [],
      fetchMessages: async () => [],
    };
    const unregister = registerSocialAdapter(adapter);
    expect(getSocialAdapter('PINTEREST')).toBe(adapter);
    expectPolicyError(() => registerSocialAdapter(adapter), 409);
    unregister();
    expectPolicyError(() => getSocialAdapter('PINTEREST'), 503);
  });

  it('does not allow the content author to approve through the shared policy', () => {
    expectPolicyError(() => assertIndependentReviewer('author', 'author'), 409);
    expect(() => assertIndependentReviewer('author', 'reviewer')).not.toThrow();
  });
});
