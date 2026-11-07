import type { PackageTypesResult } from './pick-next-package-types-step';

export function formatPackageTypesReport(checked: PackageTypesResult): string {
  if (checked.exitCode === 0) {
    return "package types: a project that imports the tarball's subpaths type-checks\n";
  }

  return `package types: ${checked.step} exited ${checked.exitCode}\n${checked.stdout}${checked.stderr}`;
}
