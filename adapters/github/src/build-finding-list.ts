import type { Disposition, FindingList, FindingState } from '@noslop/contract';
import type { FindingMarker } from './finding-marker';

export interface FindingListInput {
  findings: readonly FindingMarker[];
  dispositions: readonly Disposition[];
  confirmed: readonly string[];
}

export function buildFindingList(input: FindingListInput): FindingList {
  const latest = new Map(input.dispositions.map((item) => [item.findingID, item]));
  const confirmed = new Set(input.confirmed);

  return {
    findings: input.findings.map((finding) => {
      const disposition = latest.get(finding.id);

      const state: FindingState =
        disposition === undefined ||
        (disposition.kind === 'fixed' && !confirmed.has(`${finding.id}:${disposition.value}`))
          ? 'open'
          : disposition.kind;

      return {
        id: finding.id,
        path: finding.path,
        severity: finding.severity,
        state,
        author: disposition?.author ?? null,
      };
    }),
  };
}
