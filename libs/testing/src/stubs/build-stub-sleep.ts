export interface StubSleep {
  sleep: (delayMs: number) => Promise<void>;

  nextSleep: () => Promise<number>;

  wake: () => void;
}

export function buildStubSleep(): StubSleep {
  const running: (() => void)[] = [];
  const started: number[] = [];
  const watchers: ((delayMs: number) => void)[] = [];

  return {
    sleep: (delayMs) => {
      const ending = Promise.withResolvers<void>();

      running.push(ending.resolve);

      const watcher = watchers.shift();

      if (watcher === undefined) {
        started.push(delayMs);
      } else {
        watcher(delayMs);
      }

      return ending.promise;
    },
    nextSleep: () => {
      const delayMs = started.shift();

      if (delayMs !== undefined) {
        return Promise.resolve(delayMs);
      }

      const start = Promise.withResolvers<number>();

      watchers.push(start.resolve);

      return start.promise;
    },
    wake: () => {
      const end = running.shift();

      if (end === undefined) {
        throw new Error('no sleep is running to wake');
      }

      end();
    },
  };
}
