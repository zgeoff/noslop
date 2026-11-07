import { expect, mock, test } from 'bun:test';
import { runPackageTypesCheck } from './run-package-types-check';
import type { ProgramResult } from './run-program';

function setupTest() {
  const writePackage = mock<(outDir: string) => Promise<unknown>>(() => Promise.resolve());

  const writeFile = mock<(path: string, content: string) => Promise<unknown>>(() =>
    Promise.resolve(),
  );

  const runProgram = mock<(argv: readonly string[], cwd: string) => ProgramResult>();

  return { writePackage, writeFile, runProgram };
}

test('it packs the package, installs the tarball in the project and returns the result of tsc', async () => {
  const ctx = setupTest();

  ctx.runProgram
    .mockReturnValueOnce({ exitCode: 0, stdout: 'noslop-cli.tgz\n', stderr: '' })
    .mockReturnValueOnce({ exitCode: 0, stdout: '', stderr: '' })
    .mockReturnValueOnce({ exitCode: 0, stdout: '', stderr: '' });

  const checked = await runPackageTypesCheck('/work/check-e5', ctx);

  expect(checked).toStrictEqual({ step: 'tsc', exitCode: 0, stdout: '', stderr: '' });

  expect(ctx.runProgram.mock.calls).toStrictEqual([
    [
      ['bun', 'pm', 'pack', '--quiet', '--filename', '/work/check-e5/noslop-cli.tgz'],
      '/work/check-e5/package',
    ],
    [['bun', 'install', '--silent'], '/work/check-e5/project'],
    [[expect.stringMatching(/node_modules\/\.bin\/tsc$/u), '-p', '.'], '/work/check-e5/project'],
  ]);
});

test('it writes the package to its own folder and the project files to the project folder', async () => {
  const ctx = setupTest();

  ctx.runProgram.mockReturnValue({ exitCode: 0, stdout: '', stderr: '' });

  await runPackageTypesCheck('/work/check-f6', ctx);

  expect(ctx.writePackage.mock.calls).toStrictEqual([['/work/check-f6/package']]);

  expect(ctx.writeFile.mock.calls.map(([path]) => path)).toIncludeSameMembers([
    '/work/check-f6/project/package.json',
    '/work/check-f6/project/tsconfig.json',
    '/work/check-f6/project/index.ts',
  ]);
});

test('it stops at the pack and returns its result when the pack fails', async () => {
  const ctx = setupTest();

  ctx.runProgram.mockReturnValueOnce({
    exitCode: 1,
    stdout: '',
    stderr: 'error: no package.json found\n',
  });

  const checked = await runPackageTypesCheck('/work/check-g7', ctx);

  expect(checked).toStrictEqual({
    step: 'pack',
    exitCode: 1,
    stdout: '',
    stderr: 'error: no package.json found\n',
  });

  expect(ctx.runProgram).toHaveBeenCalledTimes(1);
});

test('it stops at the install and returns its result when the install fails', async () => {
  const ctx = setupTest();

  ctx.runProgram
    .mockReturnValueOnce({ exitCode: 0, stdout: 'noslop-cli.tgz\n', stderr: '' })
    .mockReturnValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: 'error: GET https://registry.npmjs.org/zod - 503\n',
    });

  const checked = await runPackageTypesCheck('/work/check-h8', ctx);

  expect(checked).toStrictEqual({
    step: 'install',
    exitCode: 1,
    stdout: '',
    stderr: 'error: GET https://registry.npmjs.org/zod - 503\n',
  });

  expect(ctx.runProgram).toHaveBeenCalledTimes(2);
});
