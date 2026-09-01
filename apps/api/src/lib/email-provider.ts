import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const RESEND_API_URL = 'https://api.resend.com/emails';
export const RESEND_TEST_PAYLOAD_VERSION = 'resend-test-probe-v1';
export const DEFAULT_PROVIDER_TIMEOUT_MS = 5_000;
export const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export type SandboxDeliveryScenario = 'DELIVERED' | 'BOUNCED' | 'COMPLAINED' | 'SUPPRESSED';

const SANDBOX_RECIPIENTS: Record<SandboxDeliveryScenario, string> = {
  DELIVERED: 'delivered@resend.dev',
  BOUNCED: 'bounced@resend.dev',
  COMPLAINED: 'complained@resend.dev',
  SUPPRESSED: 'suppressed@resend.dev',
};

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function resolveSandboxRecipient(scenario: SandboxDeliveryScenario): string {
  return SANDBOX_RECIPIENTS[scenario];
}

export type TestProviderDispatchInput = {
  sendAttemptId: string;
  idempotencyKey: string;
  scenario: SandboxDeliveryScenario;
};

export type TestProviderDispatchResult = {
  providerMessageId: string;
};

export interface TestEmailProvider {
  readonly provider: 'RESEND';
  payloadHash(input: TestProviderDispatchInput): string;
  dispatch(input: TestProviderDispatchInput): Promise<TestProviderDispatchResult>;
}

export class ProviderDispatchError extends Error {
  constructor(readonly outcome: 'DEFINITE_FAILURE' | 'UNKNOWN', readonly code: string) {
    super(code);
    this.name = 'ProviderDispatchError';
  }
}

export type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export type ResendTestProviderConfig = {
  apiKey: string;
  fromAddress: string;
  timeoutMs?: number;
  fetchImpl?: FetchImplementation;
};

function validateResendConfig(config: ResendTestProviderConfig) {
  if (!/^re_[A-Za-z0-9_]+$/.test(config.apiKey)) {
    throw new ProviderDispatchError('DEFINITE_FAILURE', 'PROVIDER_CONFIGURATION_INVALID');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.fromAddress)) {
    throw new ProviderDispatchError('DEFINITE_FAILURE', 'PROVIDER_CONFIGURATION_INVALID');
  }
  const timeoutMs = config.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 10_000) {
    throw new ProviderDispatchError('DEFINITE_FAILURE', 'PROVIDER_CONFIGURATION_INVALID');
  }
  return timeoutMs;
}

function buildResendTestPayload(
  config: ResendTestProviderConfig,
  input: TestProviderDispatchInput
) {
  const recipient = resolveSandboxRecipient(input.scenario);
  return {
    from: config.fromAddress,
    to: [recipient],
    subject: `Koseoglu Growth sandbox ${input.scenario}`,
    text: `Synthetic provider probe for attempt ${input.sendAttemptId}. No customer content.`,
    tags: [{ name: 'send_attempt_id', value: input.sendAttemptId }],
  };
}

async function readResendErrorType(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as Record<string, unknown>;
    for (const key of ['name', 'type', 'code']) {
      if (typeof body[key] === 'string') return body[key];
    }
  } catch {
    // Classification remains conservative when the provider error body is absent or malformed.
  }
  return undefined;
}

/**
 * Resend adapter for provider-owned simulation addresses only. It never receives
 * customer content or a customer address; the payload is a fixed synthetic probe.
 */
export function createResendTestProvider(config: ResendTestProviderConfig): TestEmailProvider {
  const timeoutMs = validateResendConfig(config);
  const fetchImpl = config.fetchImpl ?? fetch;

  return {
    provider: 'RESEND',
    payloadHash(input) {
      return sha256(
        JSON.stringify({
          version: RESEND_TEST_PAYLOAD_VERSION,
          ...buildResendTestPayload(config, input),
        })
      );
    },
    async dispatch(input) {
      if (!/^[A-Za-z0-9_-]{1,256}$/.test(input.sendAttemptId)) {
        throw new ProviderDispatchError('DEFINITE_FAILURE', 'PROVIDER_CORRELATION_ID_INVALID');
      }
      const payload = buildResendTestPayload(config, input);

      let response: Response;
      try {
        response = await fetchImpl(RESEND_API_URL, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            'content-type': 'application/json',
            'idempotency-key': input.idempotencyKey,
            'user-agent': 'koseoglu-growth/phase5-test-sandbox',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new ProviderDispatchError('UNKNOWN', 'PROVIDER_TRANSPORT_OUTCOME_UNKNOWN');
      }

      if (!response.ok) {
        if (response.status === 409) {
          const errorType = await readResendErrorType(response);
          if (errorType === 'invalid_idempotent_request') {
            throw new ProviderDispatchError(
              'DEFINITE_FAILURE',
              'PROVIDER_IDEMPOTENCY_PAYLOAD_MISMATCH'
            );
          }
          if (errorType === 'concurrent_idempotent_requests') {
            throw new ProviderDispatchError('UNKNOWN', 'PROVIDER_IDEMPOTENCY_CONCURRENT');
          }
        }
        const outcome = [400, 401, 403, 404, 405, 422].includes(response.status)
          ? 'DEFINITE_FAILURE'
          : 'UNKNOWN';
        throw new ProviderDispatchError(outcome, `PROVIDER_HTTP_${response.status}`);
      }

      let providerMessageId: unknown;
      try {
        const body = (await response.json()) as { id?: unknown };
        providerMessageId = body.id;
      } catch {
        throw new ProviderDispatchError('UNKNOWN', 'PROVIDER_RESPONSE_INVALID');
      }
      if (
        typeof providerMessageId !== 'string' ||
        providerMessageId.length < 1 ||
        providerMessageId.length > 200 ||
        !/^[A-Za-z0-9_-]+$/.test(providerMessageId)
      ) {
        throw new ProviderDispatchError('UNKNOWN', 'PROVIDER_RESPONSE_INVALID');
      }
      return { providerMessageId };
    },
  };
}

export class WebhookVerificationError extends Error {
  readonly statusCode = 400;

  constructor(message = 'Invalid webhook signature') {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}

type SvixHeaders = {
  id: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
};

function decodeWebhookSecret(secret: string): Buffer {
  if (!secret.startsWith('whsec_')) throw new WebhookVerificationError();
  const encoded = secret.slice('whsec_'.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new WebhookVerificationError();
  const decoded = Buffer.from(encoded, 'base64');
  if (decoded.length < 16) throw new WebhookVerificationError();
  return decoded;
}

export function verifySvixWebhook(input: {
  payload: string;
  headers: SvixHeaders;
  secret: string;
  now?: Date;
  toleranceSeconds?: number;
}) {
  const { id, timestamp, signature } = input.headers;
  if (!id || !/^[A-Za-z0-9_-]{1,200}$/.test(id) || !timestamp || !signature) {
    throw new WebhookVerificationError();
  }
  if (!/^\d{1,12}$/.test(timestamp)) throw new WebhookVerificationError();
  const timestampSeconds = Number(timestamp);
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1_000);
  const tolerance = input.toleranceSeconds ?? DEFAULT_WEBHOOK_TOLERANCE_SECONDS;
  if (
    !Number.isSafeInteger(timestampSeconds) ||
    Math.abs(nowSeconds - timestampSeconds) > tolerance
  ) {
    throw new WebhookVerificationError('Webhook timestamp is outside the accepted window');
  }

  const secretBytes = decodeWebhookSecret(input.secret);
  const expected = createHmac('sha256', secretBytes)
    .update(`${id}.${timestamp}.${input.payload}`)
    .digest();
  const matches = signature.split(' ').some((candidate) => {
    const [version, encoded, ...extra] = candidate.split(',');
    if (version !== 'v1' || !encoded || extra.length > 0) return false;
    let actual: Buffer;
    try {
      actual = Buffer.from(encoded, 'base64');
    } catch {
      return false;
    }
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
  if (!matches) throw new WebhookVerificationError();

  return { providerEventId: id, providerTimestamp: new Date(timestampSeconds * 1_000) };
}
