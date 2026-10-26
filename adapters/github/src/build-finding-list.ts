import type { Disposition, FindingList } from '@noslop/contract';
import type { AnswerEvidence } from './find-answer-refusal';
import { findAnswerRefusal } from './find-answer-refusal';
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
      const refusal = findAnswerRefusal(finding, disposition, input);

      return {
        id: finding.id,
        path: finding.path,
        severity: finding.severity,
        state: disposition === undefined || refusal !== null ? 'open' : disposition.kind,
        author: disposition?.author ?? null,
        reason: refusal?.reason ?? null,
        unjudged: refusal?.isUnjudged ?? false,
      };
    }),
  };
}
