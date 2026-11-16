import { cp } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

const ZOD_DIR = join(import.meta.dir, '..', 'node_modules', 'zod');

const zodManifestSchema = z.looseObject({
  version: z.string().regex(/^\d+\.\d+\.\d+$/u),
});

// npm publishes no zod newer than the catalog's at every moment, so the check stands one in: the
// installed zod with its patch number raised. It installs from a file, with no network access.
export async function writeNewerZodPackage(outDir: string): Promise<void> {
  const installedManifest: unknown = await Bun.file(join(ZOD_DIR, 'package.json')).json();

  const manifest = zodManifestSchema.parse(installedManifest);

  await cp(ZOD_DIR, outDir, { recursive: true, dereference: true });

  await Bun.write(
    join(outDir, 'package.json'),
    JSON.stringify({ ...manifest, version: buildNextPatchVersion(manifest.version) }, null, 2),
  );
}

function buildNextPatchVersion(version: string): string {
  const [major, minor, patch] = version.split('.').map(Number);

  return `${major}.${minor}.${Number(patch) + 1}`;
}
