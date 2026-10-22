import type { FixPart } from './format-fix-part';
import { formatFixPart } from './format-fix-part';

export interface FixPartsInput {
  findingPath: string;

  // the fix commit's diff of each file it touched
  commitDiffs: readonly FixPart[];

  // each file the fix commit touched, whole at the head, for each one the head holds as text
  headFiles: readonly FixPart[];
  netDiff: FixPart;
  maxFileChars: number;

  // the characters the call has left once its prompt names every part as left out
  budget: number;
}

export interface FixParts {
  parts: FixPart[];
  leftOut: FixPart[];
}

// the parts a fix call reads, most needed first, with the largest part of each kind left out first;
// null when the prompt passes the budget with no part, or the fix commit's diff of the finding's
// file does not fit
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

// what reading a part adds to a prompt that names it as left out: its block and the blank line
// before it, less its line in the list of parts left out and that line's newline
function buildPartCost(part: FixPart): number {
  return formatFixPart(part, false).length + 2 - (formatFixPart(part, true).length + 1);
}
