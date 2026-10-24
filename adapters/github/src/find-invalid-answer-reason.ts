import type { Disposition } from '@noslop/contract';
import type { FindingMarker } from './finding-marker';

export interface AnswerEvidence {
  reported: readonly string[];

  confirmed: readonly string[];

  existingIssues: ReadonlySet<string>;

  unread: ReadonlySet<string>;
}

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
  const fix = commit === '' ? 'the fix' : `the commit ${commit}`;
  const isConfirmed = evidence.confirmed.includes(`${finding.id}:${commit}`);

  if (evidence.unread.has(finding.id) && !isConfirmed) {
    return `no fix check has read ${fix} yet`;
  }

  if (evidence.reported.includes(finding.id)) {
    return 'the re-review still finds it';
  }

  return isConfirmed ? null : `no re-review has read ${fix} yet`;
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
