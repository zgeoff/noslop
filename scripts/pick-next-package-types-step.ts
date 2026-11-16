import type { ProgramResult } from './run-program';

export type PackageTypesStep =
  | 'pack'
  | 'pack-newer-zod'
  | 'install'
  | 'tsc'
  | 'install-newer-zod'
  | 'tsc-newer-zod';

export interface PackageTypesResult extends ProgramResult {
  step: PackageTypesStep;
}

export type NextPackageTypesStep = { next: PackageTypesStep } | { done: PackageTypesResult };

const FOLLOWING_STEP: Record<Exclude<PackageTypesStep, 'tsc-newer-zod'>, PackageTypesStep> = {
  pack: 'pack-newer-zod',
  'pack-newer-zod': 'install',
  install: 'tsc',
  tsc: 'install-newer-zod',
  'install-newer-zod': 'tsc-newer-zod',
};

export function pickNextPackageTypesStep(
  step: PackageTypesStep,
  result: ProgramResult,
): NextPackageTypesStep {
  if (result.exitCode !== 0 || step === 'tsc-newer-zod') {
    return { done: { step, ...result } };
  }

  return { next: FOLLOWING_STEP[step] };
}
