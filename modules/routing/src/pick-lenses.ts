import type { LensID, SpecialChange } from '@noslop/contract';
import { LENS_IDS } from '@noslop/contract';
import type { RouteInput } from './types';

// the lenses a special change runs in place of the triggers; a sync and a release run the static
// checks alone, and a direct push routes like any other change
const SPECIAL_LENSES: Readonly<Record<Exclude<SpecialChange, 'direct-push'>, readonly LensID[]>> = {
  sync: [],
  release: [],
  'docs-only': ['documentation', 'instructions'],
};

// each lens's trigger, read from the slices and the changed paths alone
const TRIGGERS: Readonly<Record<LensID, (input: RouteInput) => boolean>> = {
  correctness: (input) =>
    input.change.files.some((file) => file.kind === 'code' || file.kind === 'test'),
  'failure-handling-and-observability': (input) => input.slices.throws.length > 0,
  'concurrency-and-data-integrity': (input) => {
    const slices = input.slices;

    return (
      slices.writes.length >= input.config.thresholds.concurrencyMinWrites ||
      slices.writes.some((write) => write.eventsBeside.length > 0) ||
      (slices.writes.length > 0 && slices.events.length > 0) ||
      slices.migrations.length > 0
    );
  },
  security: (input) => input.slices.security.length > 0,
  'architecture-and-boundaries': (input) =>
    input.slices.interfaces.length > 0 ||
    input.slices.functions.some(
      (entry) =>
        entry.complexity >= input.config.thresholds.complexityMin && entry.ioCalls.length > 0,
    ),
  'naming-shape-and-comments': (input) =>
    input.slices.functions.some((entry) => entry.isNew && entry.exported) ||
    input.slices.comments.perThousand > input.slices.comments.target,
  'cross-repo-and-platform-limits': (input) => input.slices.edges.length > 0,
  'deploy-and-config': (input) => input.slices.config.length > 0,
  intent: (input) => input.linkedIssue !== null,
  tests: (input) => input.slices.tests.length > 0 || input.slices.functions.length > 0,
  reuse: (input) => input.slices.reuse.length > 0,
  instructions: (input) => input.slices.instructions.length > 0,
  documentation: (input) =>
    input.slices.prose.some((entry) => entry.isNew) ||
    input.slices.prose.reduce((sum, entry) => sum + entry.changedLines, 0) >=
      input.config.thresholds.docsMinLines,
};

// fires correctness on any change that holds code, every other lens on its trigger, and every lens a
// marked risk class forces on; a lens the config turns off stays off unless a risk class forces it
export function pickLenses(input: RouteInput, special: SpecialChange | null): LensID[] {
  const forced = new Set(
    input.signals.riskClasses.flatMap((name) => input.config.riskClasses[name]?.forces ?? []),
  );

  const candidates =
    special === null || special === 'direct-push' ? LENS_IDS : SPECIAL_LENSES[special];

  const fired = new Set(candidates.filter((lens) => TRIGGERS[lens](input)));

  if (special === null || special === 'direct-push') {
    for (const lens of forced) {
      fired.add(lens);
    }
  }

  return LENS_IDS.filter(
    (lens) => fired.has(lens) && (input.config.lenses[lens]?.enabled !== false || forced.has(lens)),
  );
}
