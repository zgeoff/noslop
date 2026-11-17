import type { Finding } from '@noslop/contract';

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

    for (const member of members) {
      used.add(member.id);
    }

    for (const id of collectRemovedIDs(members, order)) {
      removed.add(id);
    }
  }

  return findings.filter((finding) => !removed.has(finding.id));
}

const SEVERITY_RANK = { P1: 0, P2: 1, P3: 2 } as const;

function collectRemovedIDs(
  members: readonly Finding[],
  order: ReadonlyMap<string, number>,
): string[] {
  const byPath = Map.groupBy(members, (member) => member.anchor.path);

  return [...byPath.values()].flatMap((inFile) => {
    if (inFile.length < 2) {
      return [];
    }

    const [kept] = inFile.toSorted(
      (left, right) =>
        SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] ||
        (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0),
    );

    return inFile.filter((member) => member !== kept).map((member) => member.id);
  });
}
