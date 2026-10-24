import type { Disposition, FindingList } from '@noslop/contract';
import type { AnswerEvidence } from './find-invalid-answer-reason';
import { findInvalidAnswerReason } from './find-invalid-answer-reason';
import type { FindingMarker } from './finding-marker';

export interface FindingListInput extends AnswerEvidence {
  findings: readonly FindingMarker[];
  dispositions: readonly Disposition[];
}

export function buildFindingList(input: FindingListInput): FindingList {
  const latest = new Map(input.dispositions.map((item) => [item.findingID, item]));

  return {
    findings: input.findings.map((finding) => {
      const disposition = latest.get(finding.id);
      const reason = findInvalidAnswerReason(finding, disposition, input);

      return {
        id: finding.id,
        path: finding.path,
        severity: finding.severity,
        state: disposition === undefined || reason !== null ? 'open' : disposition.kind,
        author: disposition?.author ?? null,
        reason,
      };
    }),
  };
}
