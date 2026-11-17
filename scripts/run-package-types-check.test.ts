import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTempPrefix } from '@noslop/testing';
import { runPackageTypesCheck } from './run-package-types-check';
import type { ProgramResult } from './run-program';
import { runProgram } from './run-program';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), `${readTempPrefix()}noslop-package-types-test-`));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const writePackage = mock<(outDir: string) => Promise<unknown>>(() => Promise.resolve());
  const writeNewerZodPackage = mock<(outDir: string) => Promise<unknown>>(() => Promise.resolve());

  const writeFile = mock<(path: string, content: string) => Promise<unknown>>(() =>
    Promise.resolve(),
  );

  const fakeProgram = mock<(argv: readonly string[], cwd: string) => ProgramResult>();
  const env = { ...process.env };
  const realProgram = (argv: readonly string[], cwd: string) => runProgram(argv, { cwd, env });

  return { directory, writePackage, writeNewerZodPackage, writeFile, fakeProgram, realProgram };
}

test('it packs the package and a newer zod, then installs and type-checks each project', async () => {
  const ctx = await setupTest();

  ctx.fakeProgram.mockReturnValue({ exitCode: 0, stdout: '', stderr: '' });

  const checked = await runPackageTypesCheck('/work/check-e5', {
    writePackage: ctx.writePackage,
    writeNewerZodPackage: ctx.writeNewerZodPackage,
    writeFile: ctx.writeFile,
    runProgram: ctx.fakeProgram,
  });

  expect(checked).toStrictEqual({ step: 'tsc-newer-zod', exitCode: 0, stdout: '', stderr: '' });

  expect(ctx.fakeProgram.mock.calls).toStrictEqual([
    [
      ['bun', 'pm', 'pack', '--quiet', '--filename', '/work/check-e5/noslop-cli.tgz'],
      '/work/check-e5/package',
    ],
    [
      ['bun', 'pm', 'pack', '--quiet', '--filename', '/work/check-e5/newer-zod.tgz'],
      '/work/check-e5/newer-zod',
    ],
    [['bun', 'install', '--silent'], '/work/check-e5/project'],
    [[expect.stringMatching(/node_modules\/\.bin\/tsc$/u), '-p', '.'], '/work/check-e5/project'],
    [['bun', 'install', '--silent'], '/work/check-e5/project-newer-zod'],
    [
      [expect.stringMatching(/node_modules\/\.bin\/tsc$/u), '-p', '.'],
      '/work/check-e5/project-newer-zod',
    ],
  ]);
});

test('it writes the package, the newer zod and each project to its own folder', async () => {
  const ctx = await setupTest();

  ctx.fakeProgram.mockReturnValue({ exitCode: 0, stdout: '', stderr: '' });

  await runPackageTypesCheck('/work/check-f6', {
    writePackage: ctx.writePackage,
    writeNewerZodPackage: ctx.writeNewerZodPackage,
    writeFile: ctx.writeFile,
    runProgram: ctx.fakeProgram,
  });

  expect(ctx.writePackage.mock.calls).toStrictEqual([['/work/check-f6/package']]);
  expect(ctx.writeNewerZodPackage.mock.calls).toStrictEqual([['/work/check-f6/newer-zod']]);

  expect(ctx.writeFile.mock.calls.map(([path]) => path)).toIncludeSameMembers([
    '/work/check-f6/project/package.json',
    '/work/check-f6/project/tsconfig.json',
    '/work/check-f6/project/index.ts',
    '/work/check-f6/project-newer-zod/package.json',
    '/work/check-f6/project-newer-zod/tsconfig.json',
    '/work/check-f6/project-newer-zod/index.ts',
  ]);
});

test("it returns tsc's exit code and diagnostics when tsc fails", async () => {
  const ctx = await setupTest();

  ctx.fakeProgram
    .mockReturnValueOnce({ exitCode: 0, stdout: '', stderr: '' })
    .mockReturnValueOnce({ exitCode: 0, stdout: '', stderr: '' })
    .mockReturnValueOnce({ exitCode: 0, stdout: '', stderr: '' })
    .mockReturnValueOnce({
      exitCode: 2,
      stdout: "index.ts(3,23): error TS2307: Cannot find module '@noslop/cli/check'.\n",
      stderr: 'tsc: 1 error\n',
    });

  const checked = await runPackageTypesCheck('/work/check-i9', {
    writePackage: ctx.writePackage,
    writeNewerZodPackage: ctx.writeNewerZodPackage,
    writeFile: ctx.writeFile,
    runProgram: ctx.fakeProgram,
  });

  expect(checked).toStrictEqual({
    step: 'tsc',
    exitCode: 2,
    stdout: "index.ts(3,23): error TS2307: Cannot find module '@noslop/cli/check'.\n",
    stderr: 'tsc: 1 error\n',
  });
});

test("it returns the TS2322 of the newer zod project's tsc when the package nests its own zod", async () => {
  const ctx = await setupTest();

  ctx.fakeProgram
    .mockReturnValueOnce({ exitCode: 0, stdout: '', stderr: '' })
    .mockReturnValueOnce({ exitCode: 0, stdout: '', stderr: '' })
    .mockReturnValueOnce({ exitCode: 0, stdout: '', stderr: '' })
    .mockReturnValueOnce({ exitCode: 0, stdout: '', stderr: '' })
    .mockReturnValueOnce({ exitCode: 0, stdout: '', stderr: '' })
    .mockReturnValueOnce({
      exitCode: 2,
      stdout:
        "index.ts(31,14): error TS2322: Type 'ZodObject' is not assignable to type 'ZodType'.\n",
      stderr: '',
    });

  const checked = await runPackageTypesCheck('/work/check-j1', {
    writePackage: ctx.writePackage,
    writeNewerZodPackage: ctx.writeNewerZodPackage,
    writeFile: ctx.writeFile,
    runProgram: ctx.fakeProgram,
  });

  expect(checked).toStrictEqual({
    step: 'tsc-newer-zod',
    exitCode: 2,
    stdout:
      "index.ts(31,14): error TS2322: Type 'ZodObject' is not assignable to type 'ZodType'.\n",
    stderr: '',
  });
});

test('it stops at the pack and returns its failure when the package folder holds no manifest', async () => {
  const ctx = await setupTest();

  const checked = await runPackageTypesCheck(ctx.directory, {
    writePackage: (outDir) => mkdir(outDir, { recursive: true }),
    writeNewerZodPackage: ctx.writeNewerZodPackage,
    writeFile: ctx.writeFile,
    runProgram: ctx.realProgram,
  });

  expect(checked).toStrictEqual({
    step: 'pack',
    exitCode: 1,
    stdout: '',
    stderr: expect.stringContaining('package.json'),
  });

  expect(ctx.writeFile).not.toHaveBeenCalled();
});

test("it stops at the install and returns its failure when the project's manifest is no JSON", async () => {
  const ctx = await setupTest();

  const checked = await runPackageTypesCheck(ctx.directory, {
    writePackage: (outDir) =>
      Bun.write(join(outDir, 'package.json'), '{"name":"probe-package","version":"1.0.0"}'),
    writeNewerZodPackage: (outDir) =>
      Bun.write(join(outDir, 'package.json'), '{"name":"probe-zod","version":"4.0.1"}'),
    writeFile: (path) => Bun.write(path, '{ not json'),
    runProgram: ctx.realProgram,
  });

  expect(checked).toStrictEqual({
    step: 'install',
    exitCode: 1,
    stdout: expect.any(String),
    stderr: expect.stringContaining('package.json'),
  });
});
