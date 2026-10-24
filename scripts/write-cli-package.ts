import { cp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'tsdown';
import cliPackage from '../apps/cli/package.json' with { type: 'json' };
import rootPackage from '../package.json' with { type: 'json' };

const REPO_DIR = join(import.meta.dir, '..');
const CLI_DIR = join(REPO_DIR, 'apps', 'cli');

// A native addon ships one build per platform, so it stays out of the bundle, and npm installs the
// build for the user's platform.
const EXTERNAL = ['oxc-parser'] as const;

// The library entries leave zod to npm, so a caller's schemas and the declarations share one zod.
const LIBRARY_EXTERNAL = ['zod'] as const;

const LIBRARY_ENTRIES = {
  '.': 'index',
  './contract': 'contract',
  './verify': 'verify',
  './post': 'send-result',
  './check': 'check',
} as const;

export interface CLIPackageManifest {
  name: string;
  version: string;
  description: string;
  license: string;
  repository: { type: string; url: string };
  type: 'module';
  bin: { noslop: string };
  exports: Record<string, { types: string; default: string }>;
  files: string[];
  engines: { bun: string };
  dependencies: Record<string, string>;
}

export async function writeCLIPackage(outDir: string): Promise<CLIPackageManifest> {
  const bunVersion = await Bun.file(join(REPO_DIR, '.bun-version')).text();

  const entryNames = Object.values(LIBRARY_ENTRIES);

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  await Bun.build({
    entrypoints: [join(CLI_DIR, 'src', 'cli.ts')],
    outdir: outDir,
    target: 'bun',
    external: [...EXTERNAL],
  });

  await Bun.build({
    entrypoints: entryNames.map((name) => join(CLI_DIR, 'src', `${name}.ts`)),
    outdir: outDir,
    target: 'bun',
    splitting: true,
    external: [...EXTERNAL, ...LIBRARY_EXTERNAL],
  });

  await writeDeclarations(outDir, entryNames);

  const manifest: CLIPackageManifest = {
    name: cliPackage.name,
    version: cliPackage.version,
    description: rootPackage.description,
    license: rootPackage.license,

    // the README sits at the repo root, and npm resolves its relative links against this repository
    repository: rootPackage.repository,
    type: 'module',
    bin: { noslop: './cli.js' },
    exports: Object.fromEntries(
      Object.entries(LIBRARY_ENTRIES).map(([subpath, name]) => [
        subpath,
        { types: `./${name}.d.ts`, default: `./${name}.js` },
      ]),
    ),
    files: ['*.js', '*.d.ts'],
    engines: { bun: bunVersion.trim() },
    dependencies: Object.fromEntries(
      [...EXTERNAL, ...LIBRARY_EXTERNAL].map((name) => [
        name,
        rootPackage.workspaces.catalog[name],
      ]),
    ),
  };

  await Bun.write(join(outDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  await cp(join(REPO_DIR, 'README.md'), join(outDir, 'README.md'));
  await cp(join(REPO_DIR, 'LICENSE'), join(outDir, 'LICENSE'));

  return manifest;
}

async function writeDeclarations(outDir: string, entryNames: readonly string[]): Promise<void> {
  await build({
    config: false,
    cwd: CLI_DIR,
    entry: entryNames.map((name) => `src/${name}.ts`),
    outDir,
    format: 'esm',
    platform: 'node',
    fixedExtension: false,
    clean: false,
    logLevel: 'warn',

    // TypeScript writes a declaration for a file outside the tsconfig's folder beside its source,
    // so the declarations' tsconfig sits at the repo root.
    tsconfig: join(REPO_DIR, 'tsconfig.cli-types.json'),
    dts: {
      emitDtsOnly: true,
      generator: 'tsgo',
      tsgo: { path: join(REPO_DIR, 'node_modules/.bin/tsrs') },
    },
    deps: {
      alwaysBundle: [/^@noslop\//u],
      neverBundle: [...LIBRARY_EXTERNAL],

      // npm installs no LogTape for a user of the published package, so the declarations carry
      // the logger type that the contract's types name.
      dts: {
        alwaysBundle: [/^@noslop\//u, '@logtape/logtape'],
        neverBundle: [...LIBRARY_EXTERNAL],
      },
    },
  });
}

if (import.meta.main) {
  const manifest = await writeCLIPackage(join(CLI_DIR, 'dist'));

  process.stdout.write(`built ${manifest.name}@${manifest.version} in apps/cli/dist\n`);
}
