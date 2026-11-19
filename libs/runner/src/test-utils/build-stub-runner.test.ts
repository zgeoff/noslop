import { expect, test } from 'bun:test';
import { buildStubRunner } from './build-stub-runner';

test('it answers a run whose argv starts with the answer argv', async () => {
  const stub = buildStubRunner([{ argv: ['git', 'diff'], result: { stdout: 'a diff' } }]);

  const result = await stub.runner.run(['git', 'diff', 'a..b'], { cwd: '/repo' });

  expect(result).toStrictEqual({
    exitCode: 0,
    stdout: 'a diff',
    stderr: '',
    timedOut: false,
    durationMs: 0,
  });
});

test('it uses each answer once, in the order given', async () => {
  const stub = buildStubRunner([
    { argv: ['codex'], result: { exitCode: 1 } },
    { argv: ['codex'], result: { exitCode: 0 } },
  ]);

  const first = await stub.runner.run(['codex', 'exec'], { cwd: '/repo' });
  const second = await stub.runner.run(['codex', 'exec'], { cwd: '/repo' });

  expect([first.exitCode, second.exitCode]).toStrictEqual([1, 0]);
});

test('it rejects a run that no answer matches', () => {
  const stub = buildStubRunner([{ argv: ['git'], result: {} }]);

  expect(stub.runner.run(['codex', 'exec'], { cwd: '/repo' })).rejects.toThrowWithMessage(
    Error,
    /no stub answer for: codex exec/u,
  );
});

test('it records each run with its options', async () => {
  const stub = buildStubRunner([{ argv: ['cat'], result: {} }]);

  await stub.runner.run(['cat'], { cwd: '/repo', stdin: 'the prompt' });

  expect(stub.runs).toStrictEqual([
    { argv: ['cat'], options: { cwd: '/repo', stdin: 'the prompt' } },
  ]);
});
