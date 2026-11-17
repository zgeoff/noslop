import type { FindingPost } from './build-finding-posts';
import { formatFindingComment } from './format-finding-comment';

export function formatUnanchoredComment(post: FindingPost, head: string): string {
  const finding = post.lead;
  const anchor = `\`${finding.anchor.path}:${finding.anchor.startLine}-${finding.anchor.endLine}\``;

  return [
    `GitHub cannot anchor this finding at ${anchor}, outside the diff. Answer it in a comment that starts with its id, \`${finding.id}\`.`,
    '',
    formatFindingComment(finding, head, post.folded),
  ].join('\n');
}
