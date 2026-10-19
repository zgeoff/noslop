import type { FixConfirmation } from './format-summary-comment';
import type { FixVerdict } from './pick-fix-verdict';
import { pickFixVerdict } from './pick-fix-verdict';

// one kept range as the verdict reads it: the findings it reported, and the confirmations read
// against it, which a partial range never has
export interface HeldRange {
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

  // why GitHub could not show a fix whole, by finding id, for each fix they leave unconfirmed
  failures: Map<string, string>;
}

// the fixes that loaded reviews hold, newest first: the marker's own decision, then each range; the
// first review that read the fix or reported the finding again decides
export function buildHeldFixes(evidence: HeldFixesEvidence): HeldFixes {
  const confirmed: string[] = [];

  const failures = new Map<string, string>();

  for (const answer of evidence.answers) {
    const key = `${answer.id}:${answer.commit}`;

    const verdicts: FixVerdict[] = [
      pickVerdict(
        evidence.marker.reported.includes(answer.id),
        evidence.marker.confirmed.includes(key),
      ),
      ...evidence.ranges.map((range) =>
        pickVerdict(
          range.reported.includes(answer.id),
          range.confirmations.some((item) => item.id === answer.id && item.fixed),
        ),
      ),
    ];

    if (pickFixVerdict(verdicts) === 'confirmed') {
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

  return { confirmed, failures };
}

function pickVerdict(isReported: boolean, isConfirmed: boolean): FixVerdict {
  if (isReported) {
    return 'rejected';
  }

  return isConfirmed ? 'confirmed' : 'none';
}
