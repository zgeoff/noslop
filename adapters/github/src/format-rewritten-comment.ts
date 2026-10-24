import type { Finding } from '@noslop/contract';
import { formatFindingComment } from './format-finding-comment';

export function formatRewrittenComment(finding: Finding, head: string): string {
  const commit = finding.anchorCommit ?? head;
  const anchor = `\`${finding.anchor.path}:${finding.anchor.startLine}-${finding.anchor.endLine}\``;

  return [
    `This finding sits at ${anchor} of \`${commit}\`, and a later commit rewrote those lines, so GitHub cannot anchor it at the head. Answer it in a comment that starts with its id, \`${finding.id}\`.`,
    '',
    formatFindingComment(finding, commit),
  ].join('\n');
}
