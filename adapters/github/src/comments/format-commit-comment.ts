import type { Finding } from '@noslop/contract';
import { match } from 'ts-pattern';
import { formatFindingComment } from './format-finding-comment';

export type CommitCommentReason = 'rewritten' | 'carried';

export function formatCommitComment(
  finding: Finding,
  head: string,
  reason: CommitCommentReason,
): string {
  const commit = finding.anchorCommit ?? head;
  const anchor = `\`${finding.anchor.path}:${finding.anchor.startLine}-${finding.anchor.endLine}\``;

  const lead = match(reason)
    .with(
      'rewritten',
      () =>
        `This finding sits at ${anchor} of \`${commit}\`, and a later commit rewrote those lines, so GitHub cannot anchor it at the head.`,
    )
    .with(
      'carried',
      () =>
        `An earlier review raised this finding at ${anchor} of \`${commit}\`, and its post never reached the pull request, so this review posts it.`,
    )
    .exhaustive();

  return [
    `${lead} Answer it in a comment that starts with its id, \`${finding.id}\`.`,
    '',
    formatFindingComment(finding, commit),
  ].join('\n');
}
