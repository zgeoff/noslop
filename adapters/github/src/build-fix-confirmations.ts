import type { Disposition, ReviewResult } from '@noslop/contract';
import type { FindingMarker } from './finding-marker';
import type { FixConfirmation } from './format-summary-comment';

export interface FixConfirmationsInput {
  findings: readonly FindingMarker[];

  dispositions: readonly Disposition[];

  confirmed: readonly string[];

  reported: readonly string[];
  result: ReviewResult;
}

export function buildFixConfirmations(input: FixConfirmationsInput): FixConfirmation[] {
  const latest = new Map(input.dispositions.map((item) => [item.findingID, item]));
  const confirmed = new Set(input.confirmed);
  const reported = new Set(input.reported);
  const checks = new Map((input.result.fixChecks ?? []).map((check) => [check.findingID, check]));

  const unjudged = new Map(
    (input.result.unjudgedFixes ?? []).map((item) => [item.findingID, item.reason]),
  );

  return input.findings.flatMap((finding): FixConfirmation[] => {
    const disposition = latest.get(finding.id);

    if (disposition?.kind !== 'fixed') {
      return [];
    }

    const item = { id: finding.id, title: finding.title, commit: disposition.value };
    const check = checks.get(finding.id);

    if (check !== undefined) {
      return [
        check.fixed
          ? { ...item, status: 'fixed' }
          : { ...item, status: 'not-fixed', failure: check.reason },
      ];
    }

    if (reported.has(finding.id)) {
      return [{ ...item, status: 'not-fixed' }];
    }

    if (confirmed.has(`${finding.id}:${disposition.value}`)) {
      return [{ ...item, status: 'fixed' }];
    }

    const reason = unjudged.get(finding.id);

    return [
      reason === undefined
        ? { ...item, status: 'unjudged' }
        : { ...item, status: 'unjudged', failure: reason },
    ];
  });
}
