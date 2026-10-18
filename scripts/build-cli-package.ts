// Builds the npm package of the CLI into a folder of its own: one bundle of the CLI and every
// workspace package it imports, a manifest with no workspace dependencies, and the README and the
// LICENSE. The workspace keeps running the CLI from its source.
import { cp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import cliPackage from '../apps/cli/package.json' with { type: 'json' };
import rootPackage from '../package.json' with { type: 'json' };

const REPO_DIR = join(import.meta.dir, '..');

// A native addon ships one build per platform, so it stays out of the bundle, and npm installs the
// build for the user's platform.
const EXTERNAL = ['oxc-parser'] as const;

export interface CLIPackageManifest {
  name: string;
  version: string;
  description: string;
  license: string;
  repository: { type: string; url: string; directory: string };
  type: 'module';
  bin: { noslop: string };
  files: string[];
  engines: { bun: string };
  dependencies: Record<string, string>;
}

export async function buildCLIPackage(outDir: string): Promise<CLIPackageManifest> {
  const bunVersion = await Bun.file(join(REPO_DIR, '.bun-version')).text();

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  await Bun.build({
    entrypoints: [join(REPO_DIR, 'apps', 'cli', 'src', 'cli.ts')],
    outdir: outDir,
    target: 'bun',
    external: [...EXTERNAL],
  });

  const manifest: CLIPackageManifest = {
    name: cliPackage.name,
    version: cliPackage.version,
    description: rootPackage.description,
    license: rootPackage.license,
    repository: { ...rootPackage.repository, directory: 'apps/cli' },
    type: 'module',
    bin: { noslop: './cli.js' },
    files: ['cli.js'],
    engines: { bun: bunVersion.trim() },
    dependencies: Object.fromEntries(
      EXTERNAL.map((name) => [name, rootPackage.workspaces.catalog[name]]),
    ),
  };

  await Bun.write(join(outDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  await cp(join(REPO_DIR, 'README.md'), join(outDir, 'README.md'));
  await cp(join(REPO_DIR, 'LICENSE'), join(outDir, 'LICENSE'));

  return manifest;
}

if (import.meta.main) {
  const manifest = await buildCLIPackage(join(REPO_DIR, 'apps', 'cli', 'dist'));

  process.stdout.write(`built ${manifest.name}@${manifest.version} in apps/cli/dist\n`);
}
