import type { Disposition } from '@noslop/contract';
import type { FindingMarker } from './finding-marker';
import type { SummaryMarker } from './summary-marker';

export interface CheckOutcomeInput {
  findings: readonly FindingMarker[];

  // every disposition of the pull request, oldest first; a finding's latest one counts
  dispositions: readonly Disposition[];
  summary: SummaryMarker | null;
  currentHead: string;
  commits: readonly string[];

  // the values of the `deferred` dispositions whose issue exists
  existingIssues: ReadonlySet<string>;

  // the findings whose `fixed` commit changes the finding's file
  fixChangesFile: ReadonlySet<string>;
  failedReporters: readonly string[];
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
}

// the noslop check passes when a review ran on the current head, no call or reporter failed, and every
// posted finding holds a valid disposition
export function buildCheckOutcome(input: CheckOutcomeInput): CheckOutcome {
  const latest = new Map(input.dispositions.map((item) => [item.findingID, item]));

  const open = input.findings.flatMap((finding) => {
    const reason = findInvalidReason(finding, latest.get(finding.id), input);

    return reason === null ? [] : [{ id: finding.id, title: finding.title, reason }];
  });

  const problems: string[] = [];

  if (input.summary?.head !== input.currentHead) {
    problems.push(`No review ran on the current head ${input.currentHead.slice(0, 12)}.`);
  }

  if ((input.summary?.failedCalls ?? 0) > 0) {
    problems.push(`${input.summary?.failedCalls} calls of the review failed.`);
  }

  if (input.failedReporters.length > 0) {
    problems.push(`These reporters failed: ${input.failedReporters.join(', ')}.`);
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
  };
}

function findInvalidReason(
  finding: FindingMarker,
  disposition: Disposition | undefined,
  input: CheckOutcomeInput,
): string | null {
  if (disposition === undefined) {
    return 'no disposition';
  }

  if (disposition.kind === 'fixed') {
    return findFixedReason(finding, disposition.value, input);
  }

  if (disposition.kind === 'deferred') {
    return findDeferredReason(finding, disposition.value, input);
  }

  if (disposition.kind === 'accepted-risk' && !disposition.authorIsOwner) {
    return 'only a repo owner gives accepted-risk';
  }

  return null;
}

function findFixedReason(
  finding: FindingMarker,
  commit: string,
  input: CheckOutcomeInput,
): string | null {
  if (!input.commits.some((sha) => sha.startsWith(commit))) {
    return `the commit ${commit} is not on the branch`;
  }

  if (!input.fixChangesFile.has(finding.id)) {
    return `the commit ${commit} does not change ${finding.path}`;
  }

  if (input.summary?.reported.includes(finding.id) === true) {
    return 'the re-review still finds it';
  }

  return null;
}

function findDeferredReason(
  finding: FindingMarker,
  issue: string,
  input: CheckOutcomeInput,
): string | null {
  if (finding.writtenByChange) {
    return 'the change wrote this code, so it takes fixed, not-a-defect or accepted-risk';
  }

  if (finding.severity === 'P1' || finding.lens === 'security' || finding.riskClass !== null) {
    return 'a P1, a security finding or a risk-class finding blocks the merge and cannot be deferred';
  }

  return input.existingIssues.has(issue) ? null : `the issue ${issue} does not exist`;
}
