import { join } from 'node:path';
import type { RunProgram } from '../run-program.ts';

export interface CLIPublishOptions {
  // The built package, as the CLI package build writes it.
  readonly directory: string;

  readonly env: Readonly<Record<string, string | undefined>>;
  readonly runProgram: RunProgram;
  readonly readText: (path: string) => Promise<string>;
}

export interface CLIPublishResult {
  readonly published: boolean;
  readonly spec: string;

  // What npm publish printed, for the run's log.
  readonly log: string;
}

// A version npm holds already is skipped, so a rerun after a failed step publishes nothing twice.
export async function runCLIPublish(
  options: Readonly<CLIPublishOptions>,
): Promise<CLIPublishResult> {
  const manifestText = await options.readText(join(options.directory, 'package.json'));

  const manifest = parseManifest(manifestText);
  const spec = `${manifest.name}@${manifest.version}`;

  // npm view exits non-zero for a version the registry lacks.
  const view = options.runProgram(['npm', 'view', spec, 'version'], {
    cwd: options.directory,
    env: options.env,
  });

  if (view.exitCode === 0 && view.stdout.trim() === manifest.version) {
    return { published: false, spec, log: '' };
  }

  const tarball = runChecked(options, ['bun', 'pm', 'pack', '--quiet']).stdout.trim();

  // npm publishes, not bun: trusted publishing (OIDC) needs npm 11.5.1 or later, which node 24
  // bundles, and bun publish has no OIDC support (oven-sh/bun#15601).
  const publish = runChecked(options, [
    'npm',
    'publish',
    `./${tarball}`,
    '--provenance',
    '--access',
    'public',
  ]);

  return { published: true, spec, log: publish.stdout + publish.stderr };
}

interface Manifest {
  readonly name: string;
  readonly version: string;
}

function parseManifest(text: string): Manifest {
  const manifest: unknown = JSON.parse(text);

  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    !('name' in manifest) ||
    typeof manifest.name !== 'string' ||
    !('version' in manifest) ||
    typeof manifest.version !== 'string'
  ) {
    throw new Error('the package manifest holds no name and version');
  }

  return { name: manifest.name, version: manifest.version };
}

function runChecked(options: Readonly<CLIPublishOptions>, argv: readonly string[]) {
  const result = options.runProgram(argv, { cwd: options.directory, env: options.env });

  if (result.exitCode !== 0) {
    throw new Error(`${argv.join(' ')} exited with ${result.exitCode}: ${result.stderr.trim()}`);
  }

  return result;
}
