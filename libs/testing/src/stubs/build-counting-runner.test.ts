import { expect, test } from 'bun:test';
import { createRunner } from '@noslop/runner';
import { buildCountingRunner } from './build-counting-runner';

test('it counts the runs in flight at once as its peak', async () => {
  const counting = buildCountingRunner(createRunner());

  await Promise.all([
    counting.runner.run(['sleep', '0.2'], { cwd: '/' }),
    counting.runner.run(['sleep', '0.2'], { cwd: '/' }),
    counting.runner.run(['sleep', '0.2'], { cwd: '/' }),
  ]);

  expect(counting.readPeak()).toBe(3);
});

test('it counts runs one after another as a peak of one', async () => {
  const counting = buildCountingRunner(createRunner());

  await counting.runner.run(['true'], { cwd: '/' });
  await counting.runner.run(['true'], { cwd: '/' });

  expect(counting.readPeak()).toBe(1);
});

test('it returns what the wrapped runner returns', async () => {
  const counting = buildCountingRunner(createRunner());

  const result = await counting.runner.run(['echo', 'header'], { cwd: '/' });

  expect(result.stdout).toBe('header\n');
});
