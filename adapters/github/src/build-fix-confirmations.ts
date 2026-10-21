import type { Disposition, ReviewResult } from '@noslop/contract';
import type { FindingMarker } from './finding-marker';
import type { FixConfirmation } from './format-summary-comment';

export interface FixConfirmationsInput {
  findings: readonly FindingMarker[];

  // every disposition of the pull request, oldest first; a finding's latest one counts
  dispositions: readonly Disposition[];

  // each `<finding id>:<commit>` fix the summary before held confirmed
  confirmed: readonly string[];

  // the findings the review reported, a fix call's not-fixed verdicts and `not-a-defect` answers among
  // them
  reported: readonly string[];
  result: ReviewResult;
}

// where each `fixed` answer stands after the review: a fix call's verdict decides it, a finding the
// review reports again stays open, and a fix an earlier verdict confirmed holds until one of those;
// a finding the review left out without a verdict is never confirmed by that silence
export function buildFixConfirmations(input: FixConfirmationsInput): FixConfirmation[] {
  const latest = new Map(input.dispositions.map((item) => [item.findingID, item]));
  const confirmed = new Set(input.confirmed);
  const reported = new Set(input.reported);
  const checks = new Map((input.result.fixChecks ?? []).map((check) => [check.findingID, check]));

  return input.findings.flatMap((finding): FixConfirmation[] => {
    const disposition = latest.get(finding.id);

    if (disposition?.kind !== 'fixed') {
      return [];
    }

    const item = { id: finding.id, title: finding.title, commit: disposition.value };
    const check = checks.get(finding.id);

    if (check !== undefined) {
      return [
        check.fixed ? { ...item, fixed: true } : { ...item, fixed: false, failure: check.reason },
      ];
    }

    if (reported.has(finding.id)) {
      return [{ ...item, fixed: false }];
    }

    if (confirmed.has(`${finding.id}:${disposition.value}`)) {
      return [{ ...item, fixed: true }];
    }

    const isTooLarge = input.result.notReviewed.some(
      (file) => file.path === finding.path && file.reason === 'too-large',
    );

    return [
      isTooLarge && input.result.fixChecks !== undefined
        ? {
            ...item,
            fixed: false,
            failure: 'unjudged: its diff passes the file limit, so no call read it whole',
          }
        : { ...item, fixed: false },
    ];
  });
}
