import type { ProgramResult } from './run-program';

export function formatPackageTypesReport(checked: ProgramResult): string {
  if (checked.exitCode === 0) {
    return "package types: a project that imports the tarball's subpaths type-checks\n";
  }

  return `package types: tsc exited ${checked.exitCode}\n${checked.stdout}${checked.stderr}`;
}
