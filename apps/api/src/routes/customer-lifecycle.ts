import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { CustomerLifecyclePolicyError, getCustomerLifecycle } from '../lib/customer-lifecycle';

const paramsSchema = z.object({ id: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/) }).strict();
const querySchema = z.object({ asOf: z.coerce.date().optional() }).strict();

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new CustomerLifecyclePolicyError(400, `Invalid request: ${result.error.issues.map((issue) => issue.message).join(', ')}`);
  return result.data;
}

const customerLifecycleRoutes: FastifyPluginAsync = async (server) => {
  server.get('/companies/:id/lifecycle', async (request, reply) => {
    const { id } = parse(paramsSchema, request.params);
    const { asOf } = parse(querySchema, request.query);
    return reply.send(await getCustomerLifecycle(id, asOf));
  });
};

export default customerLifecycleRoutes;
