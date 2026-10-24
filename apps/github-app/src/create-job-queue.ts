import type { Logger } from '@logtape/logtape';
import type { AppEvent } from './parse-app-event';

export interface JobQueue {
  enqueue: (event: AppEvent) => void;

  waitForIdle: () => Promise<void>;
}

export function createJobQueue(
  runJob: (event: AppEvent) => Promise<void>,
  logger: Logger,
): JobQueue {
  const tails = new Map<string, Promise<void>>();

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
