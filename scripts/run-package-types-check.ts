import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTempPrefix } from '@noslop/testing';
import { buildTypesProject } from './build-types-project';
import { formatPackageTypesReport } from './format-package-types-report';
import type { PackageTypesResult, PackageTypesStep } from './pick-next-package-types-step';
import { pickNextPackageTypesStep } from './pick-next-package-types-step';
import type { ProgramResult } from './run-program';
import { runProgram } from './run-program';
import { writeCLIPackage } from './write-cli-package';

const TSC = join(import.meta.dir, '..', 'node_modules', '.bin', 'tsc');

export interface PackageTypesCheck {
  writePackage: (outDir: string) => Promise<unknown>;
  writeFile: (path: string, content: string) => Promise<unknown>;
  runProgram: (argv: readonly string[], cwd: string) => ProgramResult;
}

export function runPackageTypesCheck(
  directory: string,
  check: PackageTypesCheck,
): Promise<PackageTypesResult> {
  const packageDir = join(directory, 'package');
  const projectDir = join(directory, 'project');
  const tarballPath = join(directory, 'noslop-cli.tgz');

  const steps: Record<PackageTypesStep, () => Promise<ProgramResult>> = {
    pack: async () => {
      await check.writePackage(packageDir);

      return check.runProgram(
        ['bun', 'pm', 'pack', '--quiet', '--filename', tarballPath],
        packageDir,
      );
    },
    install: async () => {
      await Promise.all(
        Object.entries(buildTypesProject(tarballPath)).map(([name, content]) =>
          check.writeFile(join(projectDir, name), content),
        ),
      );

      return check.runProgram(['bun', 'install', '--silent'], projectDir);
    },
    tsc: () => Promise.resolve(check.runProgram([TSC, '-p', '.'], projectDir)),
  };

  return runStepsFrom('pack', steps);
}

async function runStepsFrom(
  step: PackageTypesStep,
  steps: Readonly<Record<PackageTypesStep, () => Promise<ProgramResult>>>,
): Promise<PackageTypesResult> {
  const result = await steps[step]();

  const picked = pickNextPackageTypesStep(step, result);

  return 'done' in picked ? picked.done : runStepsFrom(picked.next, steps);
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
