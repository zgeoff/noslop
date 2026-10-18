import { isAbsolute, relative, sep } from 'node:path';
import type { ReadLocalFile, ReadRemoteFile } from '@noslop/config';
import { loadConfig } from '@noslop/config';
import type { PullRequestRef, ReviewResult } from '@noslop/contract';
import { reviewResultSchema } from '@noslop/contract';
import type { GitHubConnection } from '@noslop/github';
import { createGitHubFileReader, readPullRequestState } from '@noslop/github';

// the folder the base branch's files stand at while its config loads with no checkout; the hash
// takes each local rules path relative to it, as it takes one relative to a checkout
const BASE_BRANCH_DIR = '/base-branch';

// parses a review result and checks it against its pull request on GitHub: it must review the head,
// under a config whose hash matches the config on the base branch, so a relay posts only a review the
// repo enforces; it throws and names each mismatch
export async function verifyReviewResult(
  input: unknown,
  loadConnection: () => Promise<GitHubConnection>,
): Promise<ReviewResult> {
  const result = reviewResultSchema.parse(input);
  const pr = result.pullRequest;

  if (pr === null) {
    throw new Error('the result reviews no pull request, so it cannot verify: review with --pr');
  }

  const connection = await loadConnection();
  const state = await readPullRequestState(connection, pr);

  const readRemoteFile = createGitHubFileReader({ loadConnection });

  // every file reads from the one commit the branch points at now, so a push to the base branch while
  // the config loads cannot mix files of 2 commits
  const baseCommit = await readBranchHead(connection, pr, state.baseRef);

  const loaded = await loadConfig({
    repoDir: BASE_BRANCH_DIR,
    readRemoteFile,
    readLocalFile: makeCommitFileReader(readRemoteFile, pr, baseCommit),
  });

  const problems: string[] = [];

  if (result.head !== state.headSha) {
    problems.push(
      `it reviews ${result.head.slice(0, 12)}, but the head of the pull request is ${state.headSha.slice(0, 12)}`,
    );
  }

  if (result.configHash !== loaded.hash) {
    problems.push(
      `its config hash ${result.configHash} differs from ${loaded.hash}, the hash of the config on ${state.baseRef}`,
    );
  }

  if (problems.length > 0) {
    throw new Error(`the result does not verify: ${problems.join('; ')}`);
  }

  return result;
}

async function readBranchHead(
  connection: GitHubConnection,
  pr: PullRequestRef,
  branch: string,
): Promise<string> {
  const response = await connection.client.request('GET /repos/{owner}/{repo}/branches/{branch}', {
    owner: pr.owner,
    repo: pr.repo,
    branch,
  });

  return response.data.commit.sha;
}

// a file inside the base branch's folder reads from the commit on GitHub; a file outside it, such as
// a rules file on the reviewer's own machine, reads as missing, because the relay cannot see it
function makeCommitFileReader(
  readRemoteFile: ReadRemoteFile,
  pr: PullRequestRef,
  commit: string,
): ReadLocalFile {
  return (path) => {
    const inner = relative(BASE_BRANCH_DIR, path);

    if (inner === '' || isAbsolute(inner) || inner.split(sep)[0] === '..') {
      return Promise.resolve(null);
    }

    return readRemoteFile({
      kind: 'github',
      owner: pr.owner,
      repo: pr.repo,
      path: inner.split(sep).join('/'),
      ref: commit,
    });
  };
}
