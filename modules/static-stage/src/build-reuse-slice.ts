import type { Thresholds } from '@noslop/contract';
import type { AnalyzedFile } from './analyzed-file';
import type { BaseFunction } from './load-base-index';
import type { FunctionEntry, ReuseEntry } from './types';

// for each new function, the base functions closest to it: half the score is the overlap of the name
// tokens, and half the overlap of the calls and literals; a function with no candidate at the minimum
// score is left out, so the reuse lens fires only on a real match
export function buildReuseSlice(
  functions: readonly FunctionEntry[],
  files: readonly AnalyzedFile[],
  index: readonly BaseFunction[],
  thresholds: Thresholds,
): ReuseEntry[] {
  const entries: ReuseEntry[] = [];

  for (const entry of functions) {
    if (!entry.isNew) {
      continue;
    }

    const facts = files
      .find((file) => file.file.path === entry.location.path)
      ?.analysis?.functions.find((item) => item.startLine === entry.location.startLine);

    const tokens = splitNameTokens(entry.name);

    const fingerprint = new Set([...(facts?.calls ?? []), ...(facts?.literals ?? [])]);

    const candidates = index
      .filter((base) => !(base.name === entry.name && base.location.path === entry.location.path))
      .map((base) => ({
        name: base.name,
        location: base.location,
        score: normalizeScore(
          (countJaccard(tokens, splitNameTokens(base.name)) +
            countJaccard(fingerprint, new Set(base.fingerprint))) /
            2,
        ),
      }))
      .filter((candidate) => candidate.score >= thresholds.reuseMinScore)
      .toSorted(
        (left, right) =>
          right.score - left.score ||
          left.location.path.localeCompare(right.location.path) ||
          left.name.localeCompare(right.name),
      )
      .slice(0, thresholds.reuseShortlistSize);

    if (candidates.length > 0) {
      entries.push({ function: entry, candidates });
    }
  }

  return entries;
}

function splitNameTokens(name: string): Set<string> {
  return new Set(
    name
      .replaceAll(/(?<lower>[a-z0-9])(?<upper>[A-Z])/gu, '$<lower> $<upper>')
      .split(/[\s_-]+/u)
      .filter((token) => token !== '')
      .map((token) => token.toLowerCase()),
  );
}

function countJaccard(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  if (left.size === 0 && right.size === 0) {
    return 0;
  }

  const shared = [...left].filter((item) => right.has(item)).length;

  return shared / (left.size + right.size - shared);
}

function normalizeScore(score: number): number {
  return Math.round(score * 100) / 100;
}
