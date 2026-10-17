// runs the task on each item with at most `limit` tasks running at once, and returns the results in
// the order of the items, whatever order the tasks end in; after a task rejects, no new task starts,
// and the run rejects with that error once the tasks already running settle
export async function runConcurrently<Item, Result>(
  items: readonly Item[],
  limit: number,
  task: (item: Item, index: number) => Promise<Result>,
): Promise<Result[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`a concurrency limit is a positive whole number, not ${limit}`);
  }

  const results: Result[] = [];

  // the workers share one iterator, so each item is taken once
  const queue = items.entries();
  const failure: { error: unknown; failed: boolean } = { error: null, failed: false };

  const runNext = async (): Promise<void> => {
    if (failure.failed) {
      return;
    }

    const next = queue.next();

    if (next.done === true) {
      return;
    }

    const [index, item] = next.value;

    const outcome = await task(item, index).then(
      (result) => ({ ok: true as const, result }),
      (error: unknown) => ({ ok: false as const, error }),
    );

    // the first rejection is the one the run reports; a later one only stops its own worker
    if (!outcome.ok) {
      if (!failure.failed) {
        failure.failed = true;
        failure.error = outcome.error;
      }

      return;
    }

    results[index] = outcome.result;

    await runNext();
  };

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => runNext());

  await Promise.all(workers);

  if (failure.failed) {
    throw failure.error;
  }

  return results;
}
