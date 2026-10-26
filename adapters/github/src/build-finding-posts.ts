import { basename } from 'node:path';
import type { Finding } from '@noslop/contract';
import { formatFindingComment } from './format-finding-comment';

export interface FindingPost {
  lead: Finding;
  folded: Finding[];
}

export function buildFindingPosts(findings: readonly Finding[], head: string): FindingPost[] {
  return buildClassPosts(findings).flatMap((post) => splitToFit(post, head));
}

// GitHub's secondary limits count each comment a write creates, so a class this large posts as one
// comment instead of one comment per finding
const FOLD_MIN_FINDINGS = 5;

function buildClassPosts(findings: readonly Finding[]): FindingPost[] {
  const sizes = new Map<string, number>();

  for (const finding of findings) {
    const key = buildClassKey(finding);

    sizes.set(key, (sizes.get(key) ?? 0) + 1);
  }

  const folds = new Map<string, FindingPost>();

  const posts: FindingPost[] = [];

  for (const finding of findings) {
    const key = buildClassKey(finding);
    const fold = folds.get(key);

    if ((sizes.get(key) ?? 0) < FOLD_MIN_FINDINGS) {
      posts.push({ lead: finding, folded: [] });
    } else if (fold === undefined) {
      const post: FindingPost = { lead: finding, folded: [] };

      folds.set(key, post);
      posts.push(post);
    } else {
      fold.folded.push(finding);
    }
  }

  return posts;
}

// a static check names the file in its title, so the file's name is left out of the class
function buildClassKey(finding: Finding): string {
  const name = basename(finding.anchor.path);

  return [
    finding.lens,
    finding.criterion,
    finding.rule ?? '',
    finding.title.replaceAll(name, '\0'),
  ].join('\n');
}

// GitHub refuses a comment body over 65536 characters; the margin leaves room for the line that
// an unanchored comment puts first
const COMMENT_MAX_CHARS = 60_000;

function splitToFit(post: FindingPost, head: string): FindingPost[] {
  const half = Math.ceil(post.folded.length / 2);
  const [second, ...rest] = post.folded.slice(half);

  if (
    second === undefined ||
    formatFindingComment(post.lead, head, post.folded).length <= COMMENT_MAX_CHARS
  ) {
    return [post];
  }

  return [
    ...splitToFit({ lead: post.lead, folded: post.folded.slice(0, half) }, head),
    ...splitToFit({ lead: second, folded: rest }, head),
  ];
}
