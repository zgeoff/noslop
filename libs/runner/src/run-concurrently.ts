// runs the task on each item with at most `limit` tasks running at once, and returns the results in
// the order of the items, whatever order the tasks end in; a task that rejects rejects the whole run
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

  const runNext = async (): Promise<void> => {
    const next = queue.next();

    if (next.done === true) {
      return;
    }

    const [index, item] = next.value;

    results[index] = await task(item, index);

    await runNext();
  };

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => runNext());

  await Promise.all(workers);

  return results;
}
