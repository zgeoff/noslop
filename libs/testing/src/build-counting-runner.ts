import type { Runner } from '@noslop/runner';

export interface CountingRunner {
  runner: Runner;

  // the most runs that were in flight at one time so far
  readPeak: () => number;
}

// wraps a runner and counts the runs in flight, so a test can bound how many processes ran at once
export function buildCountingRunner(inner: Runner): CountingRunner {
  let running = 0;
  let peak = 0;

  return {
    readPeak: () => peak,
    runner: {
      run: async (argv, options) => {
        running += 1;
        peak = Math.max(peak, running);

        try {
          return await inner.run(argv, options);
        } finally {
          running -= 1;
        }
      },
    },
  };
}
