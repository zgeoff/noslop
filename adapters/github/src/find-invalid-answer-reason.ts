import type { Disposition } from '@noslop/contract';
import type { FindingMarker } from './finding-marker';

export interface AnswerEvidence {
  // the ids of the findings the latest review still reports
  reported: readonly string[];

  // each `<finding id>:<commit>` that a fix call confirmed
  confirmed: readonly string[];

  // the values of the `deferred` dispositions whose issue exists
  existingIssues: ReadonlySet<string>;

  // the findings whose `fixed <commit>` answer names a commit the head holds and the latest review
  // never read
  unread: ReadonlySet<string>;
}

// the reason a finding's latest answer leaves it open; null when the answer holds
export function findInvalidAnswerReason(
  finding: FindingMarker,
  disposition: Disposition | undefined,
  evidence: AnswerEvidence,
): string | null {
  if (disposition === undefined) {
    return 'no disposition';
  }

  if (disposition.kind === 'fixed') {
    return findFixedReason(finding, disposition.value, evidence);
  }

  if (disposition.kind === 'deferred') {
    return findDeferredReason(finding, disposition.value, evidence);
  }

  if (disposition.kind === 'accepted-risk' && !disposition.authorIsOwner) {
    return 'only a repo owner gives accepted-risk';
  }

  return null;
}

function findFixedReason(
  finding: FindingMarker,
  commit: string,
  evidence: AnswerEvidence,
): string | null {
  // a review that never read the fix judged the code before it, so its report and its silence count
  // for nothing
  if (evidence.unread.has(finding.id)) {
    return null;
  }

  if (evidence.reported.includes(finding.id)) {
    return 'the re-review still finds it';
  }

  // the sha is only a hint, so one the branch no longer holds fails nothing here
  const fix = commit === '' ? 'the fix' : `the commit ${commit}`;

  // only a fix call's verdict, which the summary keeps, confirms a fix
  if (!evidence.confirmed.includes(`${finding.id}:${commit}`)) {
    return `no re-review has read ${fix} yet`;
  }

  return null;
}

function findDeferredReason(
  finding: FindingMarker,
  issue: string,
  evidence: AnswerEvidence,
): string | null {
  if (finding.writtenByChange) {
    return 'the change wrote this code, so it takes fixed, not-a-defect or accepted-risk';
  }

  if (finding.severity === 'P1' || finding.lens === 'security' || finding.riskClass !== null) {
    return 'a P1, a security finding or a risk-class finding blocks the merge and cannot be deferred';
  }

  return evidence.existingIssues.has(issue) ? null : `the issue ${issue} does not exist`;
}
