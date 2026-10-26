import type { Disposition } from '@noslop/contract';
import type { FindingMarker } from './finding-marker';

interface UnjudgedAnswer {
  id: string;
  commit: string;
  reason: string;
}

export interface AnswerEvidence {
  reported: readonly string[];

  confirmed: readonly string[];

  unjudged: readonly UnjudgedAnswer[];

  existingIssues: ReadonlySet<string>;

  unread: ReadonlySet<string>;
}

export interface AnswerRefusal {
  reason: string;

  isUnjudged: boolean;
}

export function findAnswerRefusal(
  finding: FindingMarker,
  disposition: Disposition | undefined,
  evidence: AnswerEvidence,
): AnswerRefusal | null {
  if (disposition === undefined) {
    return buildRefusal('no disposition');
  }

  if (disposition.kind === 'fixed') {
    return findFixedRefusal(finding, disposition.value, evidence);
  }

  if (disposition.kind === 'deferred') {
    return findDeferredRefusal(finding, disposition.value, evidence);
  }

  if (disposition.kind === 'accepted-risk' && !disposition.authorIsOwner) {
    return buildRefusal('only a repo owner gives accepted-risk');
  }

  return null;
}

function buildRefusal(reason: string): AnswerRefusal {
  return { reason, isUnjudged: false };
}

function findFixedRefusal(
  finding: FindingMarker,
  commit: string,
  evidence: AnswerEvidence,
): AnswerRefusal | null {
  const fix = commit === '' ? 'the fix' : `the commit ${commit}`;
  const isConfirmed = evidence.confirmed.includes(`${finding.id}:${commit}`);

  const unjudged = evidence.unjudged.find(
    (item) => item.id === finding.id && item.commit === commit,
  );

  if (unjudged !== undefined && !isConfirmed) {
    return { reason: `the fix check could not judge ${fix}: ${unjudged.reason}`, isUnjudged: true };
  }

  if (evidence.unread.has(finding.id) && !isConfirmed) {
    return buildRefusal(`no fix check has read ${fix} yet`);
  }

  if (evidence.reported.includes(finding.id)) {
    return buildRefusal('the re-review still finds it');
  }

  return isConfirmed ? null : buildRefusal(`no re-review has read ${fix} yet`);
}

function findDeferredRefusal(
  finding: FindingMarker,
  issue: string,
  evidence: AnswerEvidence,
): AnswerRefusal | null {
  if (finding.writtenByChange) {
    return buildRefusal(
      'the change wrote this code, so it takes fixed, not-a-defect or accepted-risk',
    );
  }

  if (finding.severity === 'P1' || finding.lens === 'security' || finding.riskClass !== null) {
    return buildRefusal(
      'a P1, a security finding or a risk-class finding blocks the merge and cannot be deferred',
    );
  }

  return evidence.existingIssues.has(issue)
    ? null
    : buildRefusal(`the issue ${issue} does not exist`);
}
