import { match } from 'ts-pattern';

export type ThreadScope = 'first' | 'all-but-first';

export type AnswerPost =
  | { readonly kind: 'review-reply'; readonly commentID: number; readonly body: string }
  | { readonly kind: 'issue-comment'; readonly body: string };

export type AnswerPick =
  | { readonly kind: 'none-to-answer' }
  | { readonly kind: 'posts'; readonly posts: readonly AnswerPost[] };

// The parts of a finding thread that an answer needs, as the App's thread reader returns them.
export interface AnswerThread {
  readonly source: 'review' | 'issue';
  readonly commentID: number;
  readonly marker: {
    readonly id: string;
    readonly folded?: readonly { readonly id: string }[] | undefined;
  };
}

// The posts that answer the App's finding threads, in comment ID order. A review thread takes a
// reply whose first line is the answer. An issue thread holds one finding and any folded ones, so
// it takes one comment with a `<finding id> <answer>` line per finding.
export function pickAnswerPosts(
  threads: readonly AnswerThread[],
  scope: ThreadScope,
  answer: string,
): AnswerPick {
  const ordered = threads.toSorted((left, right) => left.commentID - right.commentID);

  const buildPosts = (picked: readonly AnswerThread[]): AnswerPick => ({
    kind: 'posts',
    posts: picked.map((thread) => buildAnswerPost(thread, answer)),
  });

  return match(scope)
    .with('first', () =>
      ordered.length === 0 ? { kind: 'none-to-answer' as const } : buildPosts(ordered.slice(0, 1)),
    )
    .with('all-but-first', () => buildPosts(ordered.slice(1)))
    .exhaustive();
}

function buildAnswerPost(thread: AnswerThread, answer: string): AnswerPost {
  return match(thread.source)
    .with('review', (): AnswerPost => ({
      kind: 'review-reply',
      commentID: thread.commentID,
      body: answer,
    }))
    .with('issue', (): AnswerPost => {
      const ids = [thread.marker.id, ...(thread.marker.folded ?? []).map((folded) => folded.id)];

      return { kind: 'issue-comment', body: ids.map((id) => `${id} ${answer}`).join('\n') };
    })
    .exhaustive();
}
