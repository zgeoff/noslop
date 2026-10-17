import type { FindingLens, Severity } from '@noslop/contract';

export interface LineRange {
  path: string;
  startLine: number;
  endLine: number;
}

export interface ReportedFinding {
  lens: FindingLens | null;
  anchor: LineRange;
  title: string;
  severity: Severity;
}

export interface MatchTarget {
  lens: FindingLens | null;
  anchor: LineRange;
}

export interface FindingMatch {
  target: number;
  reported: number;
  distance: number;
}

interface Candidate {
  target: number;
  reported: number;
  distance: number;
  lensAgrees: boolean;
  key: string;
}

// a target matches one reported finding on its path within the window: closest pairs first, then pairs
// whose lenses agree, then augmenting paths for as many matches as the window allows; ties break on
// content, so the result never depends on the order the findings were listed in
export function collectMatches(
  targets: readonly MatchTarget[],
  reported: readonly ReportedFinding[],
  windowLines: number,
): FindingMatch[] {
  const candidates = targets.flatMap((target, targetIndex) =>
    reported.flatMap((finding, reportedIndex) => {
      const distance = countLineDistance(target.anchor, finding.anchor);

      if (distance === null || distance > windowLines) {
        return [];
      }

      return [
        {
          target: targetIndex,
          reported: reportedIndex,
          distance,
          lensAgrees: target.lens !== null && target.lens === finding.lens,
          key: `${buildKey(target)}|${buildKey(finding)}|${finding.title}`,
        },
      ];
    }),
  );

  const ordered = candidates.toSorted(
    (left, right) =>
      left.distance - right.distance ||
      Number(right.lensAgrees) - Number(left.lensAgrees) ||
      left.key.localeCompare(right.key),
  );

  const state: MatchState = { byTarget: new Map(), owner: new Map(), assigned: new Map() };

  for (const candidate of ordered) {
    state.byTarget.set(candidate.target, [
      ...(state.byTarget.get(candidate.target) ?? []),
      candidate,
    ]);

    if (!state.assigned.has(candidate.target) && !state.owner.has(candidate.reported)) {
      state.assigned.set(candidate.target, candidate);
      state.owner.set(candidate.reported, candidate);
    }
  }

  const unmatched = [...state.byTarget.entries()]
    .filter(([target]) => !state.assigned.has(target))
    .toSorted(([, left], [, right]) => (left[0]?.key ?? '').localeCompare(right[0]?.key ?? ''));

  for (const [target] of unmatched) {
    findAugmentingPath(target, state, new Set());
  }

  return [...state.assigned.values()]
    .map((candidate) => ({
      target: candidate.target,
      reported: candidate.reported,
      distance: candidate.distance,
    }))
    .toSorted((left, right) => left.target - right.target);
}

interface MatchState {
  byTarget: Map<number, Candidate[]>;
  owner: Map<number, Candidate>;
  assigned: Map<number, Candidate>;
}

// gives the target a free reported finding, or moves the finding it wants to another target that can
// take a different one; false when no such path exists
function findAugmentingPath(target: number, state: MatchState, visited: Set<number>): boolean {
  for (const candidate of state.byTarget.get(target) ?? []) {
    if (visited.has(candidate.reported)) {
      continue;
    }

    visited.add(candidate.reported);

    const holder = state.owner.get(candidate.reported);

    if (holder === undefined || findAugmentingPath(holder.target, state, visited)) {
      state.owner.set(candidate.reported, candidate);
      state.assigned.set(target, candidate);

      return true;
    }
  }

  return false;
}

function buildKey(finding: MatchTarget): string {
  const anchor = finding.anchor;

  return `${normalizePath(anchor.path)}:${String(anchor.startLine).padStart(8, '0')}:${String(anchor.endLine).padStart(8, '0')}:${finding.lens ?? ''}`;
}

function countLineDistance(left: LineRange, right: LineRange): number | null {
  if (normalizePath(left.path) !== normalizePath(right.path)) {
    return null;
  }

  if (left.endLine < right.startLine) {
    return right.startLine - left.endLine;
  }

  if (right.endLine < left.startLine) {
    return left.startLine - right.endLine;
  }

  return 0;
}

function normalizePath(path: string): string {
  return path.replace(/^\.\//u, '');
}
