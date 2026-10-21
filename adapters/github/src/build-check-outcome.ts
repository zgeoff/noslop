import type { Disposition } from '@noslop/contract';
import { findInvalidAnswerReason } from './find-invalid-answer-reason';
import { findUnreviewedReason } from './find-unreviewed-reason';
import type { FindingMarker } from './finding-marker';
import type { NetChangeKey } from './net-change-key';
import type { SummaryMarker } from './summary-marker';

export interface CheckOutcomeInput {
  findings: readonly FindingMarker[];

  // every disposition of the pull request, oldest first; a finding's latest one counts
  dispositions: readonly Disposition[];
  summary: SummaryMarker | null;
  currentHead: string;

  // the key of the pull request's net change at the current head
  currentKey: NetChangeKey;

  // the values of the `deferred` dispositions whose issue exists
  existingIssues: ReadonlySet<string>;
  failedReporters: readonly string[];

  // the App's finding comments whose marker noslop cannot read
  unreadable: number;
}

interface OpenFinding {
  id: string;
  title: string;
  reason: string;
}

export interface CheckOutcome {
  conclusion: 'success' | 'failure';
  title: string;
  summary: string;
  open: OpenFinding[];

  // whether the reviews read the net change at the current head
  reviewed: boolean;
}

// the noslop check passes when the reviews read the net change at the current head, no call or
// reporter failed, the summary holds no rejected merge resolution, and every posted finding holds a
// valid disposition
export function buildCheckOutcome(input: CheckOutcomeInput): CheckOutcome {
  const latest = new Map(input.dispositions.map((item) => [item.findingID, item]));

  const open = input.findings.flatMap((finding) => {
    const reason = findInvalidReason(finding, latest.get(finding.id), input);

    return reason === null ? [] : [{ id: finding.id, title: finding.title, reason }];
  });

  const problems: string[] = [];
  const unreviewed = findUnreviewedReason(input);

  if (unreviewed !== null) {
    problems.push(unreviewed);
  }

  if ((input.summary?.failedCalls ?? 0) > 0) {
    problems.push(`${input.summary?.failedCalls} calls of the review failed.`);
  }

  if (input.failedReporters.length > 0) {
    problems.push(`These reporters failed: ${input.failedReporters.join(', ')}.`);
  }

  if (input.unreadable > 0) {
    problems.push(`${input.unreadable} finding comments hold a marker noslop cannot read.`);
  }

  for (const merge of input.summary?.rejectedMerges ?? []) {
    problems.push(`The resolution of merge ${merge.slice(0, 12)} does not hold.`);
  }

  if (open.length > 0) {
    problems.push(`${open.length} findings hold no valid disposition.`);
  }

  const passed = problems.length === 0;

  return {
    conclusion: passed ? 'success' : 'failure',
    title: passed
      ? `Every finding holds a valid disposition (${input.findings.length})`
      : (problems[0] ?? ''),
    summary: [
      ...problems,
      ...open.map((item) => `- \`${item.id}\` ${item.title}: ${item.reason}`),
    ].join('\n'),
    open,
    reviewed: unreviewed === null,
  };
}

function findInvalidReason(
  finding: FindingMarker,
  disposition: Disposition | undefined,
  input: CheckOutcomeInput,
): string | null {
  if (disposition?.kind === 'accepted-risk' && !disposition.authorIsOwner) {
    return 'only a repo owner gives accepted-risk';
  }

  return findInvalidAnswerReason(finding, disposition, {
    reported: input.summary?.reported ?? [],
    confirmed: input.summary?.confirmed ?? [],
    existingIssues: input.existingIssues,
  });
}
