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
