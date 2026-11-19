import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTempPrefix } from '@noslop/runner';
import { z } from 'zod';
import rootPackage from '../package.json' with { type: 'json' };
import { writeNewerZodPackage } from './write-newer-zod-package';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), `${readTempPrefix()}noslop-newer-zod-`));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test("it writes a zod whose version is newer than the catalog's and in the same major", async () => {
  const ctx = await setupTest();

  const catalogVersion = rootPackage.workspaces.catalog.zod;

  await writeNewerZodPackage(join(ctx.directory, 'zod'));

  const written: unknown = await Bun.file(join(ctx.directory, 'zod', 'package.json')).json();

  const manifest = z.looseObject({ name: z.string(), version: z.string() }).parse(written);

  expect({
    name: manifest.name,
    isNewer: Bun.semver.order(manifest.version, catalogVersion) === 1,
    isSameMajor: Bun.semver.satisfies(manifest.version, `^${catalogVersion}`),
  }).toStrictEqual({ name: 'zod', isNewer: true, isSameMajor: true });
});

test("it copies zod's type declarations beside the manifest", async () => {
  const ctx = await setupTest();

  await writeNewerZodPackage(join(ctx.directory, 'zod'));

  const hasDeclarations = await Bun.file(join(ctx.directory, 'zod', 'index.d.ts')).exists();

  expect(hasDeclarations).toBeTrue();
});
