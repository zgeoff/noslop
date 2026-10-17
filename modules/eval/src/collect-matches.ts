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

// a reported finding matches a target on the same path whose line range sits within the window; each
// target and each reported finding match at most once, and the closest pair wins, then the pair whose
// lenses agree, so the result does not depend on the order the reviewer listed its findings in
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
        },
      ];
    }),
  );

  const ordered = candidates.toSorted(
    (left, right) =>
      left.distance - right.distance ||
      Number(right.lensAgrees) - Number(left.lensAgrees) ||
      left.target - right.target ||
      left.reported - right.reported,
  );

  const usedTargets = new Set<number>();
  const usedReported = new Set<number>();

  const matches: FindingMatch[] = [];

  for (const candidate of ordered) {
    if (usedTargets.has(candidate.target) || usedReported.has(candidate.reported)) {
      continue;
    }

    usedTargets.add(candidate.target);
    usedReported.add(candidate.reported);

    matches.push({
      target: candidate.target,
      reported: candidate.reported,
      distance: candidate.distance,
    });
  }

  return matches.toSorted((left, right) => left.target - right.target);
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
