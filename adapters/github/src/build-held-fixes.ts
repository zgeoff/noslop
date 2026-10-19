import type { FixConfirmation } from './format-summary-comment';
import type { FixState, FixVerdict } from './pick-next-fix-state';
import { HELD_FIX_STATES, pickNextFixState } from './pick-next-fix-state';

// one kept range as the verdict reads it: the findings it reported, and the confirmations read
// against it, which a partial range never has
interface HeldRange {
  reported: readonly string[];
  confirmations: readonly FixConfirmation[];
}

export interface HeldFixesEvidence {
  // each finding's latest `fixed` answer
  answers: readonly { id: string; commit: string }[];

  // the latest review's own decision, which already weighed every review before it
  marker: { reported: readonly string[]; confirmed: readonly string[] };

  // the kept ranges, newest first
  ranges: readonly HeldRange[];
}

export interface HeldFixes {
  // each `<finding id>:<commit>` fix that the reviews a summary marker records hold
  confirmed: string[];

  // where each `<finding id>:<commit>` answer stands after those reviews, so the next review moves it
  // on from there
  states: Map<string, FixState>;

  // why GitHub could not show a fix whole, by finding id, for each fix they leave unconfirmed
  failures: Map<string, string>;
}

// the fixes that loaded reviews hold: each answer moves through the fix lifecycle from the oldest
// kept range to the newest, then the marker's own decision
export function buildHeldFixes(evidence: HeldFixesEvidence): HeldFixes {
  const confirmed: string[] = [];

  const states = new Map<string, FixState>();
  const failures = new Map<string, string>();

  for (const answer of evidence.answers) {
    const key = `${answer.id}:${answer.commit}`;

    const verdicts: FixVerdict[] = [
      ...evidence.ranges
        .map((range) =>
          pickVerdict(
            range.reported.includes(answer.id),
            range.confirmations.some((item) => item.id === answer.id && item.fixed),
          ),
        )
        .toReversed(),
      pickVerdict(
        evidence.marker.reported.includes(answer.id),
        evidence.marker.confirmed.includes(key),
      ),
    ];

    const state = verdicts.reduce<FixState>(
      (from, verdict) => pickNextFixState(from, verdict),
      'silent',
    );

    states.set(key, state);

    if (HELD_FIX_STATES.has(state)) {
      confirmed.push(key);
      continue;
    }

    const failure = evidence.ranges
      .flatMap((range) => range.confirmations)
      .find((item) => item.id === answer.id && item.failure !== undefined)?.failure;

    if (failure !== undefined) {
      failures.set(answer.id, failure);
    }
  }

  return { confirmed, states, failures };
}

function pickVerdict(isReported: boolean, isConfirmed: boolean): FixVerdict {
  if (isReported) {
    return 'rejected';
  }

  return isConfirmed ? 'confirmed' : 'none';
}
