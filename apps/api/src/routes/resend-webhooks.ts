import { FastifyPluginAsync } from 'fastify';
import { WebhookVerificationError, verifySvixWebhook } from '../lib/email-provider';
import {
  EmailSandboxPolicyError,
  parseResendWebhookPayload,
  processResendWebhook,
} from '../lib/send-attempts';

const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

export type ResendWebhookRouteOptions = {
  webhookSecret?: string;
};

function stringHeader(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * The raw JSON string is required for Svix signature verification. Parser
 * replacement is scoped to this registered plugin and does not affect other
 * application/json routes.
 */
const resendWebhookRoutes: FastifyPluginAsync<ResendWebhookRouteOptions> = async (
  server,
  options
) => {
  server.removeContentTypeParser('application/json');
  server.addContentTypeParser(
    'application/json',
    { parseAs: 'string', bodyLimit: MAX_WEBHOOK_BODY_BYTES },
    (_request, body, done) => done(null, body)
  );

  server.post('/webhooks/resend', async (request, reply) => {
    if (!options.webhookSecret) {
      return reply.status(503).send({ error: { message: 'Webhook receiver is disabled' } });
    }
    if (typeof request.body !== 'string') {
      return reply.status(400).send({ error: { message: 'Invalid webhook request' } });
    }

    try {
      const verified = verifySvixWebhook({
        payload: request.body,
        headers: {
          id: stringHeader(request.headers['svix-id']),
          timestamp: stringHeader(request.headers['svix-timestamp']),
          signature: stringHeader(request.headers['svix-signature']),
        },
        secret: options.webhookSecret,
      });
      const event = parseResendWebhookPayload(request.body);
      const result = await processResendWebhook({
        providerEventId: verified.providerEventId,
        rawPayload: request.body,
        event,
      });
      return reply.send({ received: true, status: result.status });
    } catch (error) {
      if (error instanceof WebhookVerificationError) {
        return reply.status(400).send({ error: { message: 'Invalid webhook request' } });
      }
      if (error instanceof EmailSandboxPolicyError) {
        return reply.status(error.statusCode).send({ error: { message: error.message } });
      }
      throw error;
    }
  });
};

export default resendWebhookRoutes;
