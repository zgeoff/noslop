import type { Runner } from './create-runner';

// a runner that holds at most `limit` processes of the wrapped runner at once, and queues the rest
// in the order they asked, so callers that run side by side share one limit
export function buildLimitedRunner(inner: Runner, limit: number): Runner {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`a concurrency limit is a positive whole number, not ${limit}`);
  }

  let running = 0;
  const waiting: (() => void)[] = [];

  return {
    run: async (argv, options) => {
      if (running >= limit) {
        const slot = Promise.withResolvers<void>();

        waiting.push(slot.resolve);

        await slot.promise;
      } else {
        running += 1;
      }

      try {
        return await inner.run(argv, options);
      } finally {
        const next = waiting.shift();

        // a waiting run takes the slot over, so the count stays as it is
        if (next === undefined) {
          running -= 1;
        } else {
          next();
        }
      }
    },
  };
}
