import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTempPrefix } from '@noslop/testing';
import { writeCLIPackage } from './write-cli-package';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), `${readTempPrefix()}noslop-cli-package-`));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it builds a manifest that names the bundle, the subpath exports and no workspace dependency', async () => {
  const ctx = await setupTest();
  const manifest = await writeCLIPackage(ctx.directory);

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

  await writeCLIPackage(ctx.directory);

  const files = await readdir(ctx.directory);

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

  await writeCLIPackage(ctx.directory);

  const bundle = await Bun.file(join(ctx.directory, 'cli.js')).text();

  expect(bundle).toStartWith('#!/usr/bin/env bun\n');
  expect(bundle).toInclude('{{criteria}}');
  expect(bundle).not.toInclude('oxc-parser/binding-');
});
