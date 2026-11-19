import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTempPrefix } from '@noslop/runner';
import type { TypesProject } from './build-types-project';
import { buildTypesProject } from './build-types-project';
import { formatPackageTypesReport } from './format-package-types-report';
import type { PackageTypesResult, PackageTypesStep } from './pick-next-package-types-step';
import { pickNextPackageTypesStep } from './pick-next-package-types-step';
import type { ProgramResult } from './run-program';
import { runProgram } from './run-program';
import { writeCLIPackage } from './write-cli-package';
import { writeNewerZodPackage } from './write-newer-zod-package';

const TSC = join(import.meta.dir, '..', 'node_modules', '.bin', 'tsc');

export interface PackageTypesCheck {
  writePackage: (outDir: string) => Promise<unknown>;
  writeNewerZodPackage: (outDir: string) => Promise<unknown>;
  writeFile: (path: string, content: string) => Promise<unknown>;
  runProgram: (argv: readonly string[], cwd: string) => ProgramResult;
}

export function runPackageTypesCheck(
  directory: string,
  check: PackageTypesCheck,
): Promise<PackageTypesResult> {
  const packageDir = join(directory, 'package');
  const newerZodDir = join(directory, 'newer-zod');
  const projectDir = join(directory, 'project');
  const newerZodProjectDir = join(directory, 'project-newer-zod');
  const tarballPath = join(directory, 'noslop-cli.tgz');
  const newerZodTarballPath = join(directory, 'newer-zod.tgz');

  const steps: Record<PackageTypesStep, () => Promise<ProgramResult>> = {
    pack: async () => {
      await check.writePackage(packageDir);

      return check.runProgram(
        ['bun', 'pm', 'pack', '--quiet', '--filename', tarballPath],
        packageDir,
      );
    },
    'pack-newer-zod': async () => {
      await check.writeNewerZodPackage(newerZodDir);

      return check.runProgram(
        ['bun', 'pm', 'pack', '--quiet', '--filename', newerZodTarballPath],
        newerZodDir,
      );
    },
    install: () => runProjectInstall(projectDir, buildTypesProject(tarballPath), check),
    tsc: () => Promise.resolve(check.runProgram([TSC, '-p', '.'], projectDir)),
    'install-newer-zod': () =>
      runProjectInstall(
        newerZodProjectDir,
        buildTypesProject(tarballPath, newerZodTarballPath),
        check,
      ),
    'tsc-newer-zod': () => Promise.resolve(check.runProgram([TSC, '-p', '.'], newerZodProjectDir)),
  };

  return runStepsFrom('pack', steps);
}

async function runProjectInstall(
  projectDir: string,
  project: TypesProject,
  check: PackageTypesCheck,
): Promise<ProgramResult> {
  await Promise.all(
    Object.entries(project).map(([name, content]) =>
      check.writeFile(join(projectDir, name), content),
    ),
  );

  return check.runProgram(['bun', 'install', '--silent'], projectDir);
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
      writeNewerZodPackage,
      writeFile: Bun.write,
      runProgram: (argv, cwd) => runProgram(argv, { cwd, env: process.env }),
    });

    process.stdout.write(formatPackageTypesReport(checked));

    process.exitCode = checked.exitCode;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
