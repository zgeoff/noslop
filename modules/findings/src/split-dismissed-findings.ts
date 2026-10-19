import type { DismissedFinding, Finding } from '@noslop/contract';

// a finding of this review, or a finding answered `not-a-defect`, with the code its anchor holds at its
// own head; null when the code cannot be read
export interface QuotedFinding<Item> {
  finding: Item;
  code: string | null;
}

export interface DismissedFindingsInput {
  findings: readonly QuotedFinding<Finding>[];
  dismissed: readonly QuotedFinding<DismissedFinding>[];

  // the most lines between the anchors of a new finding and an answered one that still match
  maxLines: number;
}

export interface DismissedFindingsSplit {
  kept: Finding[];
  dismissed: Finding[];
}

// splits off each finding that matches one the author answered `not-a-defect`: the same ID, or the
// same file, criterion and rule with an anchor nearby or the same code; an answered finding whose
// marker holds no criterion matches by its ID alone
export function splitDismissedFindings(input: DismissedFindingsInput): DismissedFindingsSplit {
  const kept: Finding[] = [];
  const dismissed: Finding[] = [];

  for (const item of input.findings) {
    const isDismissed = input.dismissed.some((answered) =>
      isAnsweredBy(item, answered, input.maxLines),
    );

    (isDismissed ? dismissed : kept).push(item.finding);
  }

  return { kept, dismissed };
}

function isAnsweredBy(
  item: QuotedFinding<Finding>,
  answered: QuotedFinding<DismissedFinding>,
  maxLines: number,
): boolean {
  const finding = item.finding;
  const earlier = answered.finding;

  if (finding.id === earlier.id) {
    return true;
  }

  const isSameRule =
    finding.anchor.path === earlier.path &&
    finding.criterion === earlier.criterion &&
    (finding.rule ?? null) === earlier.rule;

  if (!isSameRule) {
    return false;
  }

  return isNearby(finding, earlier, maxLines) || hasSameCode(item.code, answered.code);
}

function isNearby(finding: Finding, earlier: DismissedFinding, maxLines: number): boolean {
  if (earlier.startLine === null || earlier.endLine === null) {
    return false;
  }

  const gap = Math.max(
    earlier.startLine - finding.anchor.endLine,
    finding.anchor.startLine - earlier.endLine,
    0,
  );

  return gap <= maxLines;
}

// the code of 2 anchors matches when it holds the same lines with the indentation, the runs of spaces
// and the blank lines left out, so a moved or re-indented line still matches
function hasSameCode(code: string | null, other: string | null): boolean {
  const left = normalizeCode(code);

  return left !== '' && left === normalizeCode(other);
}

function normalizeCode(code: string | null): string {
  return (code ?? '')
    .split('\n')
    .map((line) => line.trim().replaceAll(/\s+/gu, ' '))
    .filter((line) => line !== '')
    .join('\n');
}
