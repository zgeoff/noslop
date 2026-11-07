import type { ProgramResult } from './run-program';

export type PackageTypesStep = 'pack' | 'install' | 'tsc';

export interface PackageTypesResult extends ProgramResult {
  step: PackageTypesStep;
}

export type NextPackageTypesStep = { next: PackageTypesStep } | { done: PackageTypesResult };

const FOLLOWING_STEP: Record<Exclude<PackageTypesStep, 'tsc'>, PackageTypesStep> = {
  pack: 'install',
  install: 'tsc',
};

export function pickNextPackageTypesStep(
  step: PackageTypesStep,
  result: ProgramResult,
): NextPackageTypesStep {
  if (result.exitCode !== 0 || step === 'tsc') {
    return { done: { step, ...result } };
  }

  return { next: FOLLOWING_STEP[step] };
}
