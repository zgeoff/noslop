import { basename } from 'node:path';
import type { Finding, NotReviewedFile, ReviewResult, Severity } from '@noslop/contract';
import { formatPathCode } from '@noslop/contract';
import { match } from 'ts-pattern';
import { formatMarker } from './format-marker';
import type { SummaryMarker } from './summary-marker';

export interface FixConfirmation {
  id: string;
  title: string;

  commit: string;

  status: 'fixed' | 'not-fixed' | 'unjudged';

  failure?: string;
}

export interface FixStatus {
  confirmations: readonly FixConfirmation[];
  posted: number;
}

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
      const place = item.commit === '' ? 'at the head' : `in \`${item.commit.slice(0, 7)}\``;
      const reason = item.failure === undefined ? '' : ` (${item.failure})`;

      const line = match(item.status)
        .with('fixed', () => `✅ ${item.title}: fixed ${place}`)
        .with('not-fixed', () => `❌ ${item.title}: not fixed ${place}${reason}`)
        .with('unjudged', () => `❔ ${item.title}: not judged ${place}${reason}`)
        .exhaustive();

      lines.push(line);
    }
  }

  const resolutions = result.resolutionChecks ?? [];

  if (resolutions.length > 0) {
    lines.push('');

    for (const check of resolutions) {
      const sha = `\`${check.merge.slice(0, 7)}\``;

      const line = check.sound
        ? `✅ The resolution of merge ${sha} holds: ${check.reason}`
        : `❌ The resolution of merge ${sha} does not hold: ${check.reason}`;

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

const SEVERITIES: readonly Severity[] = ['P1', 'P2', 'P3'];

function formatHeadline(findings: readonly Finding[], fixes: FixStatus, reviews: number): string {
  const fixed = fixes.confirmations.filter((item) => item.status === 'fixed').length;

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
