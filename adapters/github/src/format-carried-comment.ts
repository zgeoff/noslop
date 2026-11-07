import type { Finding } from '@noslop/contract';
import { formatFindingComment } from './format-finding-comment';

export function formatCarriedComment(finding: Finding, head: string): string {
  const commit = finding.anchorCommit ?? head;
  const anchor = `\`${finding.anchor.path}:${finding.anchor.startLine}-${finding.anchor.endLine}\``;

  return [
    `An earlier review raised this finding at ${anchor} of \`${commit}\`, and its post never reached the pull request, so this review posts it. Answer it in a comment that starts with its id, \`${finding.id}\`.`,
    '',
    formatFindingComment(finding, commit),
  ].join('\n');
}
