import { expect, test } from 'bun:test';
import { pickNextPackageTypesStep } from './pick-next-package-types-step';

test.each([
  { step: 'pack', next: 'install' },
  { step: 'install', next: 'tsc' },
] as const)('it goes on from a passed $step to $next', (row) => {
  expect(pickNextPackageTypesStep(row.step, { exitCode: 0, stdout: '', stderr: '' })).toStrictEqual(
    { next: row.next },
  );
});

test('it ends with the result of tsc when tsc passes', () => {
  expect(pickNextPackageTypesStep('tsc', { exitCode: 0, stdout: '', stderr: '' })).toStrictEqual({
    done: { step: 'tsc', exitCode: 0, stdout: '', stderr: '' },
  });
});

test.each([
  {
    step: 'pack',
    result: { exitCode: 1, stdout: '', stderr: 'error: no package.json found\n' },
  },
  {
    step: 'install',
    result: {
      exitCode: 1,
      stdout: '',
      stderr: 'error: GET https://registry.npmjs.org/zod - 503\n',
    },
  },
  {
    step: 'tsc',
    result: {
      exitCode: 2,
      stdout: "index.ts(3,23): error TS2307: Cannot find module '@noslop/cli/check'.\n",
      stderr: '',
    },
  },
] as const)('it ends at a failed $step with its result', (row) => {
  expect(pickNextPackageTypesStep(row.step, row.result)).toStrictEqual({
    done: { step: row.step, ...row.result },
  });
});
