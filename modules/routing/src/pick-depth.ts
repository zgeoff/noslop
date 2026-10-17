import type { Depth } from '@noslop/contract';
import { isGlobMatch } from '@noslop/static-stage';
import type { RouteInput } from './types';

// checks Deep first, then Light, and every other change is Standard; every threshold comes from the
// config, so 2 runs on one change pick one depth
export function pickDepth(input: RouteInput): Depth {
  const signals = input.signals;
  const thresholds = input.config.thresholds;
  const deletesInForcedPath = hasDeletionInForcedPath(input);

  if (
    signals.riskClasses.length > 0 ||
    deletesInForcedPath ||
    signals.packagesTouched >= thresholds.deepMinPackages ||
    signals.breaking ||
    input.slices.edges.some((edge) => edge.consumers.some((consumer) => consumer.repo !== null))
  ) {
    return 'deep';
  }

  const files = input.change.files;

  const codeLines = files
    .filter((file) => file.kind !== 'prose' && file.kind !== 'instructions')
    .reduce((sum, file) => sum + file.addedLines + file.deletedLines, 0);

  const isSmall =
    codeLines <= thresholds.lightMaxLines ||
    files.every((file) => file.kind === 'test') ||
    files.every((file) => file.kind === 'prose' || file.kind === 'instructions');

  const hasRiskSlice =
    input.slices.security.length > 0 ||
    input.slices.migrations.length > 0 ||
    input.slices.writes.length >= thresholds.concurrencyMinWrites;

  if (
    !hasRiskSlice &&
    signals.packagesTouched <= 1 &&
    signals.consumerEdges === 0 &&
    isSmall &&
    signals.pastEscapes.length === 0
  ) {
    return 'light';
  }

  return 'standard';
}

// a deletion in a path that a risk class forces a lens on makes the change Deep, whether or not the
// class is marked by its detectors
function hasDeletionInForcedPath(input: RouteInput): boolean {
  const forcedPaths = Object.values(input.config.riskClasses)
    .filter((riskClass) => riskClass.forces.length > 0)
    .flatMap((riskClass) => riskClass.paths);

  return input.change.files.some(
    (file) => file.deletedLines > 0 && isGlobMatch(file.path, forcedPaths),
  );
}
