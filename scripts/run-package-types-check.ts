import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTempPrefix } from '@noslop/testing';
import { buildTypesProject } from './build-types-project';
import { formatPackageTypesReport } from './format-package-types-report';
import type { ProgramResult } from './run-program';
import { runProgram } from './run-program';
import { writeCLIPackage } from './write-cli-package';

const TSC = join(import.meta.dir, '..', 'node_modules', '.bin', 'tsc');

export interface PackageTypesCheck {
  writePackage: (outDir: string) => Promise<unknown>;
  writeFile: (path: string, content: string) => Promise<unknown>;
  runProgram: (argv: readonly string[], cwd: string) => ProgramResult;
}

export interface PackageTypesResult extends ProgramResult {
  step: 'pack' | 'install' | 'tsc';
}

export async function runPackageTypesCheck(
  directory: string,
  check: PackageTypesCheck,
): Promise<PackageTypesResult> {
  const packageDir = join(directory, 'package');
  const projectDir = join(directory, 'project');
  const tarballPath = join(directory, 'noslop-cli.tgz');

  await check.writePackage(packageDir);

  const packed = check.runProgram(
    ['bun', 'pm', 'pack', '--quiet', '--filename', tarballPath],
    packageDir,
  );

  if (packed.exitCode !== 0) {
    return { step: 'pack', ...packed };
  }

  await Promise.all(
    Object.entries(buildTypesProject(tarballPath)).map(([name, content]) =>
      check.writeFile(join(projectDir, name), content),
    ),
  );

  const installed = check.runProgram(['bun', 'install', '--silent'], projectDir);

  if (installed.exitCode !== 0) {
    return { step: 'install', ...installed };
  }

  return { step: 'tsc', ...check.runProgram([TSC, '-p', '.'], projectDir) };
}

if (import.meta.main) {
  const directory = await mkdtemp(join(tmpdir(), `${readTempPrefix()}noslop-package-types-`));

  try {
    const checked = await runPackageTypesCheck(directory, {
      writePackage: writeCLIPackage,
      writeFile: Bun.write,
      runProgram: (argv, cwd) => runProgram(argv, { cwd, env: process.env }),
    });

    process.stdout.write(formatPackageTypesReport(checked));

    process.exitCode = checked.exitCode;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
