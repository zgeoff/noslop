import { expect, test } from 'bun:test';
import { pickNextPackageTypesStep } from './pick-next-package-types-step';

test.each([
  { step: 'pack', next: 'pack-newer-zod' },
  { step: 'pack-newer-zod', next: 'install' },
  { step: 'install', next: 'tsc' },
  { step: 'tsc', next: 'install-newer-zod' },
  { step: 'install-newer-zod', next: 'tsc-newer-zod' },
] as const)('it goes on from a passed $step to $next', (row) => {
  expect(pickNextPackageTypesStep(row.step, { exitCode: 0, stdout: '', stderr: '' })).toStrictEqual(
    { next: row.next },
  );
});

test("it ends with the result of the newer zod project's tsc when that tsc passes", () => {
  expect(
    pickNextPackageTypesStep('tsc-newer-zod', { exitCode: 0, stdout: '', stderr: '' }),
  ).toStrictEqual({
    done: { step: 'tsc-newer-zod', exitCode: 0, stdout: '', stderr: '' },
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
  {
    step: 'tsc-newer-zod',
    result: {
      exitCode: 2,
      stdout:
        "index.ts(31,14): error TS2322: Type 'ZodObject' is not assignable to type 'ZodType'.\n",
      stderr: '',
    },
  },
] as const)('it ends at a failed $step with its result', (row) => {
  expect(pickNextPackageTypesStep(row.step, row.result)).toStrictEqual({
    done: { step: row.step, ...row.result },
  });
});
