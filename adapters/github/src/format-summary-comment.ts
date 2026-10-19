import { basename } from 'node:path';
import type { Finding, NotReviewedFile, ReviewResult, Severity } from '@noslop/contract';
import { formatPathCode } from '@noslop/contract';
import { formatMarker } from './format-marker';
import type { SummaryMarker } from './summary-marker';

export interface FixConfirmation {
  id: string;
  title: string;

  // the commit the `fixed` disposition names
  commit: string;
  fixed: boolean;

  // on a confirmed fix, whether its commit changes the finding's own file, which the summary shows as
  // evidence and no fix needs
  changesFindingFile?: boolean;

  // why the review could not judge the fix, on a fix it leaves unconfirmed
  failure?: string;
}

// the fixes a re-review judged, and how many findings earlier reviews posted
export interface FixStatus {
  confirmations: readonly FixConfirmation[];
  posted: number;
}

const SEVERITIES: readonly Severity[] = ['P1', 'P2', 'P3'];

// the summary comment, written for a person: the count and risk of this review's findings, its failed
// calls, the files it did not review, whether each `fixed` finding is fixed, a table that links each finding to its comment, then
// the review's details collapsed and the marker the next run reads
export function formatSummaryComment(
  result: ReviewResult,
  marker: SummaryMarker,
  fixes: FixStatus,
  links: ReadonlyMap<string, string>,
): string {
  const confirmations = fixes.confirmations;
  const lines = [`### noslop: ${formatHeadline(result.findings, fixes, marker.reviews)}`];

  if (result.findings.length > 0) {
    lines.push('', `**Risk: ${pickRisk(result.findings)}.**`);
  }

  if (result.failedCalls.length > 0) {
    const count = result.failedCalls.length;

    lines.push(
      '',
      `⚠️ ${count} lens ${count === 1 ? 'call' : 'calls'} failed, so this review is partial.`,
    );
  }

  if (result.notReviewed.length > 0) {
    lines.push('', formatNotReviewed(result.notReviewed));
  }

  if (confirmations.length > 0) {
    lines.push('');

    for (const item of confirmations) {
      const sha = `\`${item.commit.slice(0, 7)}\``;

      const line = item.fixed
        ? `✅ ${item.title}: fixed in ${sha}${formatFixFiles(item.changesFindingFile)}`
        : `❌ ${item.title}: not fixed in ${sha}${item.failure === undefined ? '' : ` (${item.failure})`}`;

      lines.push(line);
    }
  }

  if (result.findings.length > 0) {
    lines.push('', '| | Finding | File |', '|---|---|---|');

    for (const finding of sortFindings(result.findings)) {
      const title = finding.title.replaceAll('|', String.raw`\|`);
      const link = links.get(finding.id);
      const file = `\`${basename(finding.anchor.path)}:${finding.anchor.startLine}\``;

      lines.push(
        `| ${finding.severity} | ${link === undefined ? title : `[${title}](${link})`} | ${file} |`,
      );
    }
  }

  lines.push('', '<details><summary>Review details</summary>', '', formatDetails(result, marker));

  for (const call of result.failedCalls) {
    lines.push('', `Failed call \`${call.id}\` (${call.lenses.join(', ')}): ${call.reason}`);
  }

  lines.push('</details>', formatMarker('summary', marker));

  return lines.join('\n');
}

// "2 findings, both P2", "3 findings: 1 P1, 2 P3", "all 2 findings fixed" once every finding an
// earlier review posted is, or "no findings", which a re-review writes as "no new findings"
function formatHeadline(findings: readonly Finding[], fixes: FixStatus, reviews: number): string {
  const fixed = fixes.confirmations.filter((item) => item.fixed).length;

  if (findings.length === 0 && fixed > 0 && fixed === fixes.posted) {
    return fixed === 1 ? '1 finding fixed' : `all ${fixed} findings fixed`;
  }

  if (findings.length === 0) {
    return reviews > 1 ? 'no new findings' : 'no findings';
  }

  const counts = SEVERITIES.map(
    (severity) =>
      [severity, findings.filter((finding) => finding.severity === severity).length] as const,
  ).filter(([, count]) => count > 0);

  const total = findings.length === 1 ? '1 finding' : `${findings.length} findings`;
  const [only] = counts;

  if (counts.length === 1 && only !== undefined) {
    const [severity] = only;

    if (findings.length === 1) {
      return `${total}, ${severity}`;
    }

    return `${total}, ${findings.length === 2 ? 'both' : 'all'} ${severity}`;
  }

  return `${total}: ${counts.map(([severity, count]) => `${count} ${severity}`).join(', ')}`;
}

// high with any P1 or any finding in a marked risk class, medium with any P2, and low otherwise
function pickRisk(findings: readonly Finding[]): 'high' | 'medium' | 'low' {
  if (findings.some((finding) => finding.severity === 'P1' || finding.riskClass !== undefined)) {
    return 'high';
  }

  return findings.some((finding) => finding.severity === 'P2') ? 'medium' : 'low';
}

const NOT_REVIEWED_REASONS: Readonly<Record<NotReviewedFile['reason'], string>> = {
  data: 'data file',
  'too-large': 'too large',
};

// GitHub refuses a comment body past its length limit, so the summary names the first files and
// counts the rest, and cuts a long path
const NOT_REVIEWED_SHOWN = 20;
const PATH_SHOWN = 200;

// a file left out of every call is named, so a reader sees what the review did not cover
function formatNotReviewed(files: readonly NotReviewedFile[]): string {
  const count = files.length === 1 ? '1 file' : `${files.length} files`;
  const rest = files.length - NOT_REVIEWED_SHOWN;

  const lines = files.slice(0, NOT_REVIEWED_SHOWN).map((file) => {
    const path = file.path.length > PATH_SHOWN ? `${file.path.slice(0, PATH_SHOWN)}…` : file.path;

    return `- ${formatPathCode(path)}: not reviewed: ${NOT_REVIEWED_REASONS[file.reason]}`;
  });

  if (rest > 0) {
    lines.push(`- and ${rest} more`);
  }

  return [`⚠️ ${count} left out of the review:`, ...lines].join('\n');
}

// which files the commit of a confirmed fix changes, as evidence for a reader: a fix such as a new
// test may live outside the finding's file
function formatFixFiles(changesFindingFile: boolean | undefined): string {
  if (changesFindingFile === undefined) {
    return '';
  }

  return changesFindingFile ? " (in the finding's file)" : ' (in other files of the pull request)';
}

function sortFindings(findings: readonly Finding[]): Finding[] {
  return findings.toSorted(
    (left, right) =>
      SEVERITIES.indexOf(left.severity) - SEVERITIES.indexOf(right.severity) ||
      left.anchor.path.localeCompare(right.anchor.path),
  );
}

function formatDetails(result: ReviewResult, marker: SummaryMarker): string {
  const parts = [
    `Review ${marker.reviews}`,
    `\`${result.head.slice(0, 12)}\` against \`${result.base.slice(0, 12)}\``,
    `${result.depth} depth`,
    `lenses ${result.lenses.length === 0 ? 'none' : result.lenses.join(', ')}`,
  ];

  if (result.special !== null) {
    parts.push(`special change: ${result.special}`);
  }

  return parts.join(' · ');
}
