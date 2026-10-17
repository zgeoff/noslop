import { expect, mock, test } from 'bun:test';
import { getLogger } from '@logtape/logtape';
import { createJobQueue } from './create-job-queue';
import type { AppEvent } from './parse-app-event';

test('it runs the jobs of one pull request in order, and runs the next after a failed one', async () => {
  const answers = {
    review: () => Promise.reject(new Error('the review failed')),
    check: () => Promise.resolve(),
  };

  const runJob = mock((event: AppEvent) => answers[event.kind]());
  const queue = createJobQueue(runJob, getLogger(['test']));

  queue.enqueue({ kind: 'review', owner: 'example', repo: 'app', number: 5, installationID: 7 });
  queue.enqueue({ kind: 'check', owner: 'example', repo: 'app', number: 5, installationID: 7 });

  await queue.waitForIdle();

  expect(runJob.mock.calls.map((call) => call[0].kind)).toStrictEqual(['review', 'check']);
});

test('it starts a job of another pull request in the same repo only after the one before ends', async () => {
  const gate = Promise.withResolvers<void>();
  const started = mock((number: number) => number);

  const answers: Record<number, () => Promise<void>> = {
    5: () => gate.promise,
    6: () => Promise.resolve(),
  };

  const queue = createJobQueue(
    (event) => {
      started(event.number);

      return answers[event.number]?.() ?? Promise.resolve();
    },
    getLogger(['test']),
  );

  queue.enqueue({ kind: 'review', owner: 'example', repo: 'app', number: 5, installationID: 7 });
  queue.enqueue({ kind: 'review', owner: 'example', repo: 'app', number: 6, installationID: 7 });
  queue.enqueue({ kind: 'review', owner: 'example', repo: 'web', number: 9, installationID: 7 });

  const idle = queue.waitForIdle();

  const beforeGate = await Promise.race([idle.then(() => 'idle'), Promise.resolve('waiting')]);

  const startedBeforeGate = started.mock.calls.map((call) => call[0]);

  gate.resolve();

  await idle;

  expect(beforeGate).toBe('waiting');
  expect(startedBeforeGate).not.toContain(6);
  expect(started.mock.calls.map((call) => call[0])).toIncludeSameMembers([5, 6, 9]);
});
