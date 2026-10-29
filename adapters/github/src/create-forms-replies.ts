import type { PullRequestRef } from '@noslop/contract';
import type { GitHubConnection } from './create-github-connection';
import { findReplyDisposition } from './find-reply-disposition';
import { DISPOSITION_FORMS } from './format-finding-comment';
import { formatMarker } from './format-marker';
import type { FindingThread, Reply } from './read-pull-request-state';
import { withWriteRetry } from './with-write-retry';

export async function createFormsReplies(
  connection: GitHubConnection,
  pr: PullRequestRef,
  threads: readonly FindingThread[],
): Promise<void> {
  const client = connection.client;
  const settled = collectDispositionReplies(threads);

  for (const thread of threads) {
    const unanswered = thread.replies.filter(
      (reply) => !settled.has(toReplyKey(thread, reply)) && !thread.answered.has(reply.id),
    );

    for (const reply of unanswered) {
      settled.add(toReplyKey(thread, reply));

      const body = `${formatFormsAnswer(thread)}\n${formatMarker('forms', { replyID: reply.id })}`;

      await withWriteRetry(
        'reply that names the disposition forms',
        'once',
        connection.sleep,
        () =>
          thread.source === 'review'
            ? client.request(
                'POST /repos/{owner}/{repo}/pulls/{pull_number}/comments/{comment_id}/replies',
                {
                  owner: pr.owner,
                  repo: pr.repo,
                  pull_number: pr.number,
                  comment_id: thread.commentID,
                  body,
                },
              )
            : client.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
                owner: pr.owner,
                repo: pr.repo,
                issue_number: pr.number,
                body,
              }),
      );

      thread.answered.add(reply.id);
    }
  }
}

function collectDispositionReplies(threads: readonly FindingThread[]): Set<string> {
  const keys = new Set<string>();

  for (const thread of threads) {
    for (const reply of thread.replies) {
      if (findReplyDisposition(reply.body, thread.marker.id) !== null) {
        keys.add(toReplyKey(thread, reply));
      }
    }
  }

  return keys;
}

// review comments and issue comments take their ids from separate sequences, so an id alone can
// name both a review reply and an issue reply
function toReplyKey(thread: FindingThread, reply: Reply): string {
  return `${thread.source}:${reply.id}`;
}

function formatFormsAnswer(thread: FindingThread): string {
  const prefix =
    thread.source === 'issue'
      ? ` Start the comment with the finding's id, \`${thread.marker.id}\`.`
      : '';

  return `That reply is not a disposition. ${DISPOSITION_FORMS}${prefix}`;
}
