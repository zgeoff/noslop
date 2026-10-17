import { expect, test } from 'bun:test';
import { runConcurrently } from './run-concurrently';

test('it returns the results in the order of the items when later tasks end first', async () => {
  const gates = [
    Promise.withResolvers<string>(),
    Promise.withResolvers<string>(),
    Promise.withResolvers<string>(),
  ];

  const ended: string[] = [];

  const run = runConcurrently(['first', 'second', 'third'], 3, async (item, index) => {
    const value = await (gates[index]?.promise ?? Promise.resolve(''));

    ended.push(item);

    return value;
  });

  gates[2]?.resolve('third-done');
  gates[1]?.resolve('second-done');
  gates[0]?.resolve('first-done');

  const results = await run;

  expect(results).toStrictEqual(['first-done', 'second-done', 'third-done']);
  expect(ended).toStrictEqual(['third', 'second', 'first']);
});

test('it runs no more tasks at once than the limit', async () => {
  const counts = { running: 0, most: 0 };

  await runConcurrently([1, 2, 3, 4, 5, 6], 2, async () => {
    counts.running += 1;
    counts.most = Math.max(counts.most, counts.running);

    await Bun.sleep(5);

    counts.running -= 1;
  });

  expect(counts.most).toBe(2);
});

test('it runs every task when the limit is above the count of items', async () => {
  const results = await runConcurrently([1, 2], 4, (item) => Promise.resolve(item * 10));

  expect(results).toStrictEqual([10, 20]);
});

test('it starts no task after one rejects, and rejects once the running tasks settle', () => {
  const gate = Promise.withResolvers<null>();
  const started: number[] = [];
  const settled: number[] = [];

  // task 1 rejects at once, and the others wait on the gate
  const waits: Record<number, Promise<null>> = {
    1: Promise.reject(new Error('the first task failed')),
  };

  const run = runConcurrently([1, 2, 3, 4], 2, async (item) => {
    started.push(item);

    await (waits[item] ?? gate.promise);

    settled.push(item);
  });

  gate.resolve(null);

  expect(run).rejects.toThrowWithMessage(Error, 'the first task failed');
  expect(started).toStrictEqual([1, 2]);
  expect(settled).toStrictEqual([2]);
});

test('it rejects a limit below 1', () => {
  expect(runConcurrently([1], 0, (item) => Promise.resolve(item))).rejects.toThrowWithMessage(
    Error,
    'a concurrency limit is a positive whole number, not 0',
  );
});
