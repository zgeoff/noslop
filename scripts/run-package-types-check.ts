import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTempPrefix } from '@noslop/testing';
import { buildTypesProject } from './build-types-project';
import { formatPackageTypesReport } from './format-package-types-report';
import type { ProgramResult } from './run-program';
import { writeCLIPackage } from './write-cli-package';

const TSC = join(import.meta.dir, '..', 'node_modules', '.bin', 'tsc');

export async function runPackageTypesCheck(directory: string): Promise<ProgramResult> {
  const packageDir = join(directory, 'package');
  const projectDir = join(directory, 'project');
  const tarballPath = join(directory, 'noslop-cli.tgz');

  await writeCLIPackage(packageDir);

  await Bun.$`bun pm pack --quiet --filename ${tarballPath}`.cwd(packageDir).quiet();

  await Promise.all(
    Object.entries(buildTypesProject(tarballPath)).map(([name, content]) =>
      Bun.write(join(projectDir, name), content),
    ),
  );

  await Bun.$`bun install --silent`.cwd(projectDir).quiet();

  const checked = await Bun.$`${TSC} -p .`.cwd(projectDir).nothrow().quiet();

  return {
    exitCode: checked.exitCode,
    stdout: checked.stdout.toString(),
    stderr: checked.stderr.toString(),
  };
}

if (import.meta.main) {
  const directory = await mkdtemp(join(tmpdir(), `${readTempPrefix()}noslop-package-types-`));

  try {
    const checked = await runPackageTypesCheck(directory);

    process.stdout.write(formatPackageTypesReport(checked));

    process.exitCode = checked.exitCode;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
