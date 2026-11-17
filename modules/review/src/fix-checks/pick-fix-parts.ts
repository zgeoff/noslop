import type { FixPart } from './format-fix-part';
import { formatFixPart } from './format-fix-part';

export interface FixPartsInput {
  findingPath: string;

  commitDiffs: readonly FixPart[];

  headFiles: readonly FixPart[];
  netDiff: FixPart;
  maxFileChars: number;

  budget: number;
}

export interface FixParts {
  parts: FixPart[];
  leftOut: FixPart[];
}

export function pickFixParts(input: FixPartsInput): FixParts | null {
  if (input.budget < 0) {
    return null;
  }

  const required = input.commitDiffs.filter((part) => part.path === input.findingPath);

  const otherDiffs = input.commitDiffs
    .filter((part) => part.path !== input.findingPath)
    .toSorted(compareSize);

  const headFiles = [
    ...input.headFiles.filter((part) => part.path === input.findingPath),
    ...input.headFiles.filter((part) => part.path !== input.findingPath).toSorted(compareSize),
  ];

  let budget = input.budget;

  for (const part of required) {
    const cost = buildPartCost(part);

    if (part.text.length > input.maxFileChars || cost > budget) {
      return null;
    }

    budget -= cost;
  }

  const parts = [...required];
  const leftOut: FixPart[] = [];

  for (const part of [...otherDiffs, ...headFiles, input.netDiff]) {
    const cost = buildPartCost(part);

    if (part.text.length > input.maxFileChars || cost > budget) {
      leftOut.push(part);
      continue;
    }

    budget -= cost;

    parts.push(part);
  }

  return { parts, leftOut };
}

function compareSize(left: FixPart, right: FixPart): number {
  return left.text.length - right.text.length;
}

function buildPartCost(part: FixPart): number {
  return formatFixPart(part, false).length + 2 - (formatFixPart(part, true).length + 1);
}
