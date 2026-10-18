import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCLIPackage } from './build-cli-package';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'noslop-cli-package-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it builds a manifest that names the bundle and no workspace dependency', async () => {
  const ctx = await setupTest();
  const manifest = await buildCLIPackage(ctx.dir);

  expect(manifest).toMatchObject({
    name: '@noslop/cli',
    description: 'A reviewer for pull requests that coding agents write',
    license: 'MIT',
    repository: {
      type: 'git',
      url: 'git+https://github.com/zgeoff/noslop.git',
      directory: 'apps/cli',
    },
    type: 'module',
    bin: { noslop: './cli.js' },
    files: ['cli.js'],
  });

  expect(Object.keys(manifest.dependencies)).toStrictEqual(['oxc-parser']);
  expect(manifest.engines.bun).toMatch(/^\d+\.\d+\.\d+$/u);
});

test('it writes the bundle, the manifest, the README and the LICENSE and nothing else', async () => {
  const ctx = await setupTest();

  await buildCLIPackage(ctx.dir);

  const files = await readdir(ctx.dir);

  expect(files).toIncludeSameMembers(['cli.js', 'package.json', 'README.md', 'LICENSE']);
});

test('it bundles the lens prompts and leaves the native parser to npm', async () => {
  const ctx = await setupTest();

  await buildCLIPackage(ctx.dir);

  const bundle = await Bun.file(join(ctx.dir, 'cli.js')).text();

  expect(bundle).toStartWith('#!/usr/bin/env bun\n');
  expect(bundle).toInclude('{{criteria}}');
  expect(bundle).not.toInclude('oxc-parser/binding-');
});
