import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerErrorHandler } from '../src/plugins/errorHandler';

async function buildServer(statusCode: unknown) {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  app.get('/boom', async () => {
    const error = new Error('boom') as Error & { statusCode?: unknown };
    if (statusCode !== 'MISSING') error.statusCode = statusCode;
    throw error;
  });
  return app;
}

describe('error handler status normalisation', () => {
  const cases: Array<[unknown, number, string]> = [
    [0, 500, 'Internal server error'],
    [200, 500, 'Internal server error'],
    [600, 500, 'Internal server error'],
    [Number.NaN, 500, 'Internal server error'],
    ['404', 500, 'Internal server error'],
    [404, 404, 'boom'],
    [422, 422, 'boom'],
    [503, 503, 'boom']
  ];

  for (const [input, expectedStatus, expectedMessage] of cases) {
    it(`maps statusCode=${String(input)} to ${expectedStatus}`, async () => {
      const app = await buildServer(input);
      const response = await app.inject({ method: 'GET', url: '/boom' });
      expect(response.statusCode).toBe(expectedStatus);
      expect(response.json()).toEqual({ error: { message: expectedMessage } });
      await app.close();
    });
  }

  it('keeps an error without statusCode at 500', async () => {
    const app = await buildServer('MISSING');
    const response = await app.inject({ method: 'GET', url: '/boom' });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: { message: 'Internal server error' } });
    await app.close();
  });
});