import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/prisma', () => {
  const failure = new Error('database unavailable');
  return {
    prisma: {
      $transaction: async () => {
        throw failure;
      },
      job: { findMany: async () => [], findFirst: async () => null, updateMany: async () => ({ count: 0 }) }
    }
  };
});

import { startJobScheduler } from '../src/lib/job-queue';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('job scheduler tick resilience', () => {
  it('reports a failing tick through onTickError instead of rejecting the process', async () => {
    const onTickError = vi.fn();
    const stop = startJobScheduler('pr-a-scheduler-test', { intervalMs: 20, onTickError });

    await new Promise((resolve) => setTimeout(resolve, 120));
    stop();

    expect(onTickError).toHaveBeenCalled();
    const [, error] = onTickError.mock.calls[0] ?? [];
    expect((error as Error).message).toBe('database unavailable');
  });

  it('rejects an interval below the 10ms floor', () => {
    expect(() => startJobScheduler('pr-a-scheduler-test', { intervalMs: 5 })).toThrow('Invalid intervalMs');
  });
});