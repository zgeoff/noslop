import type { Logger } from '@logtape/logtape';
import type { AppEvent } from './parse-app-event';

export interface JobQueue {
  enqueue: (event: AppEvent) => void;

  // settles once every job queued so far has ended
  waitForIdle: () => Promise<void>;
}

// runs the jobs of one repo one at a time, in the order they came, because they share the repo's
// clone and 2 reviews of one pull request must never post at once; the jobs of different repos run
// side by side, and a failed job is logged and leaves the next one to run
export function createJobQueue(
  runJob: (event: AppEvent) => Promise<void>,
  logger: Logger,
): JobQueue {
  const tails = new Map<string, Promise<void>>();

  // the job runs once the one before it ends; a failure is logged, so the chain never rejects
  const runAfter = async (previous: Promise<void>, event: AppEvent, key: string) => {
    await previous;

    try {
      await runJob(event);
    } catch (error) {
      logger.error('the {kind} job of {key} failed: {error}', { kind: event.kind, key, error });
    }
  };

  return {
    enqueue: (event) => {
      const key = `${event.owner}/${event.repo}`;
      const previous = tails.get(key) ?? Promise.resolve();

      tails.set(key, runAfter(previous, event, key));
    },
    waitForIdle: async () => {
      await Promise.all(tails.values());
    },
  };
}
