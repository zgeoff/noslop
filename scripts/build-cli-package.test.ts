import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCLIPackage } from './build-cli-package';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'noslop-cli-package-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  // the repo's TypeScript, which checks a project that installs the packed package
  const tsc = join(import.meta.dir, '..', 'node_modules', '.bin', 'tsc');

  return { dir, tsc };
}

test('it builds a manifest that names the bundle, the subpath exports and no workspace dependency', async () => {
  const ctx = await setupTest();
  const manifest = await buildCLIPackage(ctx.dir);

  expect(manifest).toMatchObject({
    name: '@noslop/cli',
    description: 'A reviewer for pull requests that coding agents write',
    license: 'MIT',
    repository: { type: 'git', url: 'git+https://github.com/zgeoff/noslop.git' },
    type: 'module',
    bin: { noslop: './cli.js' },
    exports: {
      '.': { types: './index.d.ts', default: './index.js' },
      './contract': { types: './contract.d.ts', default: './contract.js' },
      './verify': { types: './verify.d.ts', default: './verify.js' },
      './post': { types: './send-result.d.ts', default: './send-result.js' },
      './check': { types: './check.d.ts', default: './check.js' },
    },
    files: ['*.js', '*.d.ts'],
  });

  expect(Object.keys(manifest.dependencies)).toStrictEqual(['oxc-parser', 'zod']);
  expect(manifest.engines.bun).toMatch(/^\d+\.\d+\.\d+$/u);
});

test('it writes the bundles, their declarations, the manifest, the README and the LICENSE', async () => {
  const ctx = await setupTest();

  await buildCLIPackage(ctx.dir);

  const files = await readdir(ctx.dir);

  expect(files).toIncludeAllMembers([
    'cli.js',
    'index.js',
    'index.d.ts',
    'contract.js',
    'contract.d.ts',
    'verify.js',
    'verify.d.ts',
    'send-result.js',
    'send-result.d.ts',
    'check.js',
    'check.d.ts',
    'package.json',
    'README.md',
    'LICENSE',
  ]);

  expect(files).toSatisfyAll(
    (file: string) =>
      /^[\w-]+\.(?:js|d\.ts)$/u.test(file) ||
      ['package.json', 'README.md', 'LICENSE'].includes(file),
  );
});

test('it bundles the lens prompts and leaves the native parser to npm', async () => {
  const ctx = await setupTest();

  await buildCLIPackage(ctx.dir);

  const bundle = await Bun.file(join(ctx.dir, 'cli.js')).text();

  expect(bundle).toStartWith('#!/usr/bin/env bun\n');
  expect(bundle).toInclude('{{criteria}}');
  expect(bundle).not.toInclude('oxc-parser/binding-');
});

test('it ships declarations that a project importing the contract from the tarball type-checks against', async () => {
  const ctx = await setupTest();

  const packageDir = join(ctx.dir, 'package');
  const projectDir = join(ctx.dir, 'project');

  await buildCLIPackage(packageDir);

  await Bun.$`bun pm pack --quiet`.cwd(packageDir).quiet();

  const packed = await readdir(packageDir);

  const tarball = packed.find((file) => file.endsWith('.tgz'));

  await Bun.write(
    join(projectDir, 'package.json'),
    JSON.stringify({
      name: 'project',
      private: true,
      type: 'module',
      dependencies: { '@noslop/cli': `file:${join(packageDir, tarball ?? '')}` },
    }),
  );

  await Bun.write(
    join(projectDir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        module: 'nodenext',
        moduleResolution: 'nodenext',
        target: 'esnext',
        noEmit: true,
        skipLibCheck: false,
        types: [],
      },
      include: ['index.ts'],
    }),
  );

  await Bun.write(
    join(projectDir, 'index.ts'),
    [
      "import type { ReviewResult } from '@noslop/cli/contract';",
      "import { REVIEW_OUTPUT_VERSION, reviewResultSchema } from '@noslop/cli/contract';",
      "import { check } from '@noslop/cli/check';",
      "import { sendResult } from '@noslop/cli/post';",
      "import { verify } from '@noslop/cli/verify';",
      '',
      'export function verifyHead(value: unknown): Promise<string> {',
      '  return verify(value, { env: {} }).then((result) => result.head);',
      '}',
      '',
      'export function postHead(value: unknown): Promise<string> {',
      '  return sendResult(value, { env: {}, verify: false }).then((result) => result.head);',
      '}',
      '',
      'export function isReviewed(): Promise<boolean> {',
      "  return check({ owner: 'o', repo: 'r', number: 1 }, { env: {} }).then((outcome) => outcome.reviewed);",
      '}',
      '',
      'export function countFindings(value: unknown): number {',
      '  const result: ReviewResult = reviewResultSchema.parse(value);',
      '  const version: typeof REVIEW_OUTPUT_VERSION = result.version;',
      '',
      '  return result.findings.length + version;',
      '}',
      '',
      '// @ts-expect-error a finding count is no string',
      'export const wrong: string = countFindings({});',
      '',
    ].join('\n'),
  );

  await Bun.$`bun install --silent`.cwd(projectDir).quiet();

  const checked = await Bun.$`${ctx.tsc} -p ${projectDir}`.nothrow().quiet();

  expect({ exitCode: checked.exitCode, stdout: checked.stdout.toString() }).toStrictEqual({
    exitCode: 0,
    stdout: '',
  });
});
