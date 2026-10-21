import type { Disposition, FindingList, FindingState } from '@noslop/contract';
import type { FindingMarker } from './finding-marker';

export interface FindingListInput {
  findings: readonly FindingMarker[];

  // every disposition of the pull request, oldest first; a finding's latest one counts
  dispositions: readonly Disposition[];

  // each `<finding id>:<commit>` fix that a fix call judged fixed, as the summary keeps it
  confirmed: readonly string[];
}

// each posted finding with the kind of its latest answer and that answer's author; a `fixed` answer
// counts only once a fix call confirms it, and the gate that reads the list judges who may answer
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
