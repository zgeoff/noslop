import type { ReviewConfig } from '@noslop/contract';
import type { PackageManifest } from './analyzed-file';
import { isGlobMatch } from './is-glob-match';
import type { Change, RiskSignals, Slices } from './types';

const DELETION_CALL = /(?:^|\.)(?:delete\w*|remove\w*|rm|unlink|drop\w*|truncate\w*|destroy\w*)$/iu;

export interface RiskSignalInputs {
  change: Change;
  slices: Slices;
  manifests: readonly PackageManifest[];
  config: ReviewConfig;
  title: string;
  body: string;
  pastEscapes: readonly string[];
}

// the signals routing reads to fire lenses and pick the depth; a risk class is marked when a changed
// path matches its globs or one of its detectors fires on a slice
export function buildRiskSignals(inputs: RiskSignalInputs): RiskSignals {
  const paths = inputs.change.files.map((file) => file.path);
  const detectors = collectFiredDetectors(inputs.slices);

  const riskClasses = Object.entries(inputs.config.riskClasses)
    .filter(
      ([, riskClass]) =>
        paths.some((path) => isGlobMatch(path, riskClass.paths)) ||
        riskClass.detectors.some((detector) => detectors.has(detector)),
    )
    .map(([name]) => name)
    .toSorted();

  const packages = new Set(
    paths.map(
      (path) =>
        inputs.manifests
          .filter((manifest) => manifest.dir === '.' || path.startsWith(`${manifest.dir}/`))
          .toSorted((left, right) => right.dir.length - left.dir.length)[0]?.path ?? '.',
    ),
  );

  const text = `${inputs.title}\n${inputs.body}`;

  return {
    riskClasses,
    detectors: [...detectors].toSorted(),
    packagesTouched: packages.size,
    consumerEdges: inputs.slices.edges.length,
    changedLines: inputs.change.files.reduce(
      (sum, file) => sum + file.addedLines + file.deletedLines,
      0,
    ),
    deletedLines: inputs.change.files.reduce((sum, file) => sum + file.deletedLines, 0),
    breaking: inputs.config.breakingMarkers.some((marker) => text.includes(marker)),
    pastEscapes: paths.filter((path) => inputs.pastEscapes.includes(path)),
  };
}

function collectFiredDetectors(slices: Slices): Set<string> {
  const fired = new Set<string>(slices.security.map((entry) => entry.part));

  if (slices.migrations.length > 0) {
    fired.add('migration');
  }

  if (slices.writes.some((write) => DELETION_CALL.test(write.call))) {
    fired.add('deletion');
  }

  return fired;
}
