import { expect, test } from 'bun:test';
import { buildLimitedRunner } from './build-limited-runner';
import type { RunResult } from './create-runner';

test('it holds the runs past the limit until a running one ends, then starts them in the order they asked', async () => {
  const gates = [
    Promise.withResolvers<void>(),
    Promise.withResolvers<void>(),
    Promise.withResolvers<void>(),
  ];

  const started: string[] = [];

  const limited = buildLimitedRunner(
    {
      run: async (argv) => {
        const name = argv[0] ?? '';

        started.push(name);

        await gates[started.length - 1]?.promise;

        return { exitCode: 0, stdout: name, stderr: '', timedOut: false, durationMs: 0 };
      },
    },
    2,
  );

  const runs = ['first', 'second', 'third'].map((name) => limited.run([name], { cwd: '/' }));
  const startedBeforeEnd = [...started];

  gates[0]?.resolve();
  gates[1]?.resolve();
  gates[2]?.resolve();

  const results = await Promise.all(runs);

  expect(startedBeforeEnd).toStrictEqual(['first', 'second']);
  expect(started).toStrictEqual(['first', 'second', 'third']);

  expect(results.map((result: RunResult) => result.stdout)).toStrictEqual([
    'first',
    'second',
    'third',
  ]);
});

test('it frees the slot of a run that rejects', async () => {
  const limited = buildLimitedRunner(
    {
      run: (argv) =>
        argv[0] === 'fail'
          ? Promise.reject(new Error('spawn failed'))
          : Promise.resolve({
              exitCode: 0,
              stdout: 'ok',
              stderr: '',
              timedOut: false,
              durationMs: 0,
            }),
    },
    1,
  );

  const failed = await limited.run(['fail'], { cwd: '/' }).then(
    () => null,
    (error: unknown) => error,
  );

  const result = await limited.run(['echo'], { cwd: '/' });

  expect(failed).toBeInstanceOf(Error);
  expect(result.stdout).toBe('ok');
});

test('it rejects a limit below one', () => {
  expect(() =>
    buildLimitedRunner({ run: () => Promise.reject(new Error('unused')) }, 0),
  ).toThrowWithMessage(Error, /a concurrency limit is a positive whole number, not 0/u);
});
