import type { Reporter } from '@noslop/contract';
import type { LoadStoreOptions } from './load-store';
import { loadStore } from './load-store';
import { writeReview } from './write-review';

// the reporter that records each review in the store at its options' path, or at the given default;
// a failed open or write names the review whose record it lost, since the reporters after it, such
// as the GitHub check, still run and the review leaves no other trace of the loss
export function createSQLiteReporter(
  defaultPath: string,
  options: LoadStoreOptions = {},
): Reporter {
  return {
    id: 'sqlite',
    report: async (result, ctx) => {
      try {
        const store = await loadStore(ctx.options.path ?? defaultPath, options);

        try {
          await writeReview(store, result);
        } finally {
          await store.destroy();
        }
      } catch (error) {
        const pullRequest = result.pullRequest === null ? '' : `#${result.pullRequest.number}`;
        const reason = error instanceof Error ? error.message : String(error);

        throw new Error(
          `the store record of the review of ${result.repo}${pullRequest} at ${result.head} was not written: ${reason}`,
          { cause: error },
        );
      }
    },
  };
}
