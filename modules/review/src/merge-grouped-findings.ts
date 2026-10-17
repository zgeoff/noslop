import type { Finding } from '@noslop/contract';

const SEVERITY_RANK = { P1: 0, P2: 1, P3: 2 } as const;

// keeps one finding of each group, the one with the highest severity and, on a tie, the first in the
// list; an ID the list does not hold, or one an earlier group took, plays no part, so a group the
// model returns can only remove a finding that another finding of its group still reports
export function mergeGroupedFindings(
  findings: readonly Finding[],
  groups: readonly (readonly string[])[],
): Finding[] {
  const order = new Map(findings.map((finding, index) => [finding.id, index]));
  const removed = new Set<string>();
  const used = new Set<string>();

  for (const group of groups) {
    const members = [...new Set(group)]
      .filter((id) => order.has(id) && !used.has(id))
      .map((id) => findings[order.get(id) ?? 0])
      .filter((finding) => finding !== undefined);

    if (members.length < 2) {
      continue;
    }

    const [kept] = members.toSorted(
      (left, right) =>
        SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] ||
        (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0),
    );

    for (const member of members) {
      used.add(member.id);

      if (member !== kept) {
        removed.add(member.id);
      }
    }
  }

  return findings.filter((finding) => !removed.has(finding.id));
}
