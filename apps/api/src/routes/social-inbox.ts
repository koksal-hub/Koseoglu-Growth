import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  classifySocialInboxMessage,
  listSocialInbox,
  recordSocialInboxReceipt,
} from '../lib/social-inbox';
import type { SocialInboxIntent } from '../lib/social-inbox';
import { SocialContentPolicyError } from '../lib/social-content';

const platformSchema = z.enum([
  'LINKEDIN',
  'INSTAGRAM',
  'FACEBOOK',
  'X',
  'THREADS',
  'TIKTOK',
  'YOUTUBE',
  'GOOGLE_BUSINESS',
  'PINTEREST',
]);
const keySchema = z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:@/_-]*$/);
const receiptSchema = z
  .object({
    platform: platformSchema,
    accountKey: keySchema,
    externalMessageKey: keySchema,
    threadKey: keySchema,
    senderHandle: keySchema,
    messageType: keySchema,
    receivedAt: z.coerce.date(),
    contentHash: z.string().regex(/^[0-9a-f]{64}$/i),
  })
  .strict();
const listSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    status: z.enum(['RECEIVED', 'CLASSIFIED', 'ASSIGNED', 'REQUIRES_APPROVAL', 'RESPONDED', 'IGNORED']).optional(),
    intent: z.enum(['UNCLASSIFIED', 'LEAD', 'CUSTOMER', 'QUESTION', 'COMPLAINT', 'SPAM', 'OTHER']).optional(),
  })
  .strict();
const idSchema = z.object({ id: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:@/_-]*$/) }).strict();
const classifySchema = z
  .object({
    intent: z.enum(['LEAD', 'CUSTOMER', 'QUESTION', 'COMPLAINT', 'SPAM', 'OTHER']),
    reviewedBy: keySchema,
  })
  .strict();

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new SocialContentPolicyError(400, `Invalid request: ${result.error.issues.map((issue) => issue.message).join(', ')}`);
  return result.data;
}

const socialInboxRoutes: FastifyPluginAsync = async (server) => {
  server.post('/social/inbox/receipts', async (request, reply) => {
    const result = await recordSocialInboxReceipt(parse(receiptSchema, request.body));
    return reply.status(result.reused ? 200 : 201).send(result);
  });

  server.get('/social/inbox', async (request) => {
    const query = parse(listSchema, request.query);
    return listSocialInbox(query);
  });

  server.post('/social/inbox/:id/classify', async (request) => {
    const { id } = parse(idSchema, request.params);
    const input = parse(classifySchema, request.body);
    return classifySocialInboxMessage(id, input.intent as SocialInboxIntent, input.reviewedBy);
  });
};

export default socialInboxRoutes;
