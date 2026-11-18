import type { PullRequestRef } from '@noslop/contract';
import { WringerError } from '@wringer/core';
import { match } from 'ts-pattern';
import { createGitHubConnection, readPullRequestState } from '../../adapters/github/src/index.ts';
import type { GitHubConnection } from '../../adapters/github/src/index.ts';
import type { SandboxEnv } from './parse-sandbox-env.ts';
import { pickAnswerPosts } from './pick-answer-posts.ts';
import type { AnswerPost, ThreadScope } from './pick-answer-posts.ts';
import { readOpenRunState } from './read-open-run-state.ts';
import type { OpenRunState } from './read-run-state.ts';
import type { RunEndpoints } from './run-endpoints.ts';

type AnswerDisposition = 'fixed' | 'not-a-defect';

export interface AnswerInput {
  disposition: AnswerDisposition;
  threads: ThreadScope;
}

// Answers the App's finding threads as the pull request's author. The App's connection reads the
// threads, because only it knows which comments are its own.
export async function writeFindingAnswers(
  endpoints: RunEndpoints,
  sandbox: SandboxEnv,
  appConnection: GitHubConnection,
  input: AnswerInput,
): Promise<{ pullRequest: number; answered: number }> {
  const state = await readOpenRunState(endpoints);

  const pr = { owner: sandbox.owner, repo: sandbox.repo, number: state.pullRequest };

  const pullRequest = await readPullRequestState(appConnection, pr);

  const answer = buildAnswer(state, input.disposition);
  const pick = pickAnswerPosts(pullRequest.threads, input.threads, answer);

  if (pick.kind === 'none-to-answer') {
    throw new WringerError('check-failed', {
      message: 'the pull request holds no finding thread of the App to answer',
    });
  }

  const author = await createGitHubConnection(null, sandbox.token);

  for (const post of pick.posts) {
    await writeAnswerPost(author, pr, post);
  }

  return { pullRequest: state.pullRequest, answered: pick.posts.length };
}

function buildAnswer(state: OpenRunState, disposition: AnswerDisposition): string {
  return match(disposition)
    .with('not-a-defect', () => 'not-a-defect the verify journey answers this finding by hand')
    .with('fixed', () => {
      if (state.stage !== 'fixed') {
        throw new WringerError('check-failed', {
          message: 'a fixed answer names the fix commit, and the run has pushed none',
          hint: 'Run `bun verify action push-fix` first.',
        });
      }

      return `fixed ${state.fixSha}`;
    })
    .exhaustive();
}

async function writeAnswerPost(
  author: GitHubConnection,
  pr: PullRequestRef,
  post: AnswerPost,
): Promise<void> {
  const params = { owner: pr.owner, repo: pr.repo };

  await match(post)
    .with({ kind: 'review-reply' }, (reply) =>
      author.client.request(
        'POST /repos/{owner}/{repo}/pulls/{pull_number}/comments/{comment_id}/replies',
        { ...params, pull_number: pr.number, comment_id: reply.commentID, body: reply.body },
      ),
    )
    .with({ kind: 'issue-comment' }, (comment) =>
      author.client.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
        ...params,
        issue_number: pr.number,
        body: comment.body,
      }),
    )
    .exhaustive();
}
