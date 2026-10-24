import type { Depth } from '@noslop/contract';
import { isGlobMatch } from '@noslop/static-stage';
import type { RouteInput } from './types';

export function pickDepth(input: RouteInput): Depth {
  const signals = input.signals;
  const thresholds = input.config.thresholds;

  if (
    hasWeightyRiskClass(input) ||
    countForcedPathDeletions(input) >= thresholds.deepMinForcedDeletions ||
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
    input.slices.writes.length >= thresholds.concurrencyMinWrites ||
    input.slices.writes.some((write) => write.eventsBeside.length > 0) ||
    (input.slices.writes.length > 0 && input.slices.events.length > 0);

  if (
    signals.riskClasses.length === 0 &&
    !hasRiskSlice &&
    !files.some((file) => file.kind === 'infra') &&
    signals.packagesTouched <= thresholds.lightMaxPackages &&
    signals.consumerEdges === 0 &&
    isSmall &&
    signals.pastEscapes.length === 0
  ) {
    return 'light';
  }

  return 'standard';
}

function hasWeightyRiskClass(input: RouteInput): boolean {
  return input.signals.riskClasses.some((name) => {
    const riskClass = input.config.riskClasses[name];

    const lines = input.change.files
      .filter((file) => riskClass !== undefined && isGlobMatch(file.path, riskClass.paths))
      .reduce((sum, file) => sum + file.addedLines + file.deletedLines, 0);

    return lines >= input.config.thresholds.deepMinClassLines;
  });
}

function countForcedPathDeletions(input: RouteInput): number {
  const forcedPaths = Object.values(input.config.riskClasses)
    .filter((riskClass) => riskClass.forces.length > 0)
    .flatMap((riskClass) => riskClass.paths);

  return input.change.files
    .filter((file) => isGlobMatch(file.path, forcedPaths))
    .reduce((sum, file) => sum + file.deletedLines, 0);
}
