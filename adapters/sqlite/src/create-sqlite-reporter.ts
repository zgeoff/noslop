import type { Reporter } from '@noslop/contract';
import { loadStore } from './load-store';
import { writeReview } from './write-review';

// the reporter that records each review in the store at its options' path, or at the given default
export function createSQLiteReporter(defaultPath: string): Reporter {
  return {
    id: 'sqlite',
    report: async (result, ctx) => {
      const store = await loadStore(ctx.options.path ?? defaultPath);

      try {
        await writeReview(store, result);
      } finally {
        await store.destroy();
      }
    },
  };
}
