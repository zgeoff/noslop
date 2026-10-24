export async function runConcurrently<Item, Result>(
  items: readonly Item[],
  limit: number,
  task: (item: Item, index: number) => Promise<Result>,
): Promise<Result[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`a concurrency limit is a positive whole number, not ${limit}`);
  }

  const results: Result[] = [];
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
