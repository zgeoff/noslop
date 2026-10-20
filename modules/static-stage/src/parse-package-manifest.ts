import { dirname } from 'node:path';
import { z } from 'zod';
import type { PackageManifest } from './analyzed-file';

const manifestSchema = z.looseObject({
  name: z.string().optional(),
  version: z.string().optional(),
  private: z.boolean().optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
  peerDependencies: z.record(z.string(), z.string()).optional(),
  scripts: z.record(z.string(), z.string()).optional(),
});

// reads a package.json into the fields the edge slice, the version checks and the script slice use; a file that is not
// a JSON object gives null, so one broken manifest leaves the others readable
export function parsePackageManifest(path: string, text: string): PackageManifest | null {
  const parsed = manifestSchema.safeParse(parseJSON(text));

  if (!parsed.success) {
    return null;
  }

  const manifest = parsed.data;

  return {
    directory: dirname(path),
    path,
    name: manifest.name ?? null,
    version: manifest.version ?? null,
    versionLine: text.split('\n').findIndex((line) => /^\s*"version"\s*:/u.test(line)) + 1 || 1,
    isPrivate: manifest.private ?? false,
    dependencies: {
      ...manifest.peerDependencies,
      ...manifest.devDependencies,
      ...manifest.dependencies,
    },
    scriptCommands: Object.values(manifest.scripts ?? {}),
  };
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
