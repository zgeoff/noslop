import type { DismissedFinding, Finding } from '@noslop/contract';

export interface QuotedFinding<Item> {
  finding: Item;
  code: string | null;
}

export interface DismissedFindingsInput {
  findings: readonly QuotedFinding<Finding>[];
  dismissed: readonly QuotedFinding<DismissedFinding>[];

  maxLines: number;
}

export interface DismissedFindingsSplit {
  kept: Finding[];

  dismissed: { finding: Finding; answeredID: string }[];
}

export function splitDismissedFindings(input: DismissedFindingsInput): DismissedFindingsSplit {
  const kept: Finding[] = [];
  const dismissed: DismissedFindingsSplit['dismissed'] = [];

  for (const item of input.findings) {
    const answered = input.dismissed.find((earlier) => isAnsweredBy(item, earlier, input.maxLines));

    if (answered === undefined) {
      kept.push(item.finding);
    } else {
      dismissed.push({ finding: item.finding, answeredID: answered.finding.id });
    }
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

  if (isOwnIDOnly(finding)) {
    return false;
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

function isOwnIDOnly(finding: Finding): boolean {
  return finding.severity === 'P1' || finding.criterion === 'security-defect';
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
