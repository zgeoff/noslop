import type { Disposition, PullRequestRef } from '@noslop/contract';
import type { GitHubClient } from './create-github-connection';
import type { RewrittenFix } from './make-rewritten-fix-reader';
import { makeRewrittenFixReader } from './make-rewritten-fix-reader';
import type { FindingThread } from './read-pull-request-state';

export interface FixCommitsInput {
  // the pull request's own commits, as GitHub lists them
  commits: readonly string[];
  dispositions: readonly Disposition[];
  head: string;

  // the finding threads, whose markers keep the head that posted each finding
  threads: readonly FindingThread[];
}

export interface FixCommits {
  commits: string[];

  // the `fixed` shas that name more than one commit of the repo, so they name no fix
  ambiguous: string[];

  // the pull request commit that holds the change of each `<finding id>:<sha>` answer whose commit a
  // rebase rewrote, or why none does
  rewritten: ReadonlyMap<string, RewrittenFix>;
}

const FULL_SHA_LENGTH = 40;

// the commits a `fixed` answer can name: the pull request's own, each one a merge from the base
// branch brought in, and the rewrite of a commit a rebase replaced; a short sha that a pull request
// commit starts but GitHub cannot resolve names another commit too
export async function readFixCommits(
  client: GitHubClient,
  pr: PullRequestRef,
  input: FixCommitsInput,
): Promise<FixCommits> {
  const named = [
    ...new Set(
      input.dispositions
        .filter((item) => item.kind === 'fixed')
        .map((item) => item.value)
        .filter(
          (sha) => sha.length < FULL_SHA_LENGTH || !input.commits.some((commit) => commit === sha),
        ),
    ),
  ];

  const found = await Promise.all(named.map((sha) => readHeadCommit(client, pr, sha, input.head)));

  const ambiguous = named.filter(
    (sha, index) => found[index] === null && input.commits.some((commit) => commit.startsWith(sha)),
  );

  const commits = [...new Set([...input.commits, ...found.filter((sha) => sha !== null)])];

  return {
    commits,
    ambiguous,
    rewritten: await readRewrittenFixes(client, pr, { ...input, commits, ambiguous }),
  };
}

// the full sha of the commit a sha names when the head holds it: GitHub's compare of the commit with
// the head is ahead or identical, and its merge base is the commit itself; a sha that names no
// commit, or more than one, gives null
async function readHeadCommit(
  client: GitHubClient,
  pr: PullRequestRef,
  sha: string,
  head: string,
): Promise<string | null> {
  try {
    const response = await client.request('GET /repos/{owner}/{repo}/compare/{basehead}', {
      owner: pr.owner,
      repo: pr.repo,
      basehead: `${sha}...${head}`,
    });

    const isHeld = response.data.status === 'ahead' || response.data.status === 'identical';

    return isHeld ? response.data.merge_base_commit.sha : null;
  } catch (error) {
    if (isMissingCommit(error)) {
      return null;
    }

    throw error;
  }
}

// GitHub answers a compare from a sha that names no commit with 404, and one that names several
// with 422
function isMissingCommit(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error.status === 404 || error.status === 422)
  );
}

interface RewrittenFixesInput extends FixCommitsInput {
  ambiguous: readonly string[];
}

// each finding's latest `fixed` sha that names no commit the head holds, matched to the pull request
// commit with its change; each finding checks the named commit against the head that posted it
async function readRewrittenFixes(
  client: GitHubClient,
  pr: PullRequestRef,
  input: RewrittenFixesInput,
): Promise<Map<string, RewrittenFix>> {
  const latest = new Map(input.dispositions.map((item) => [item.findingID, item]));

  const readRewrittenFix = makeRewrittenFixReader(client, pr);

  const answers = input.threads.flatMap((thread) => {
    const disposition = latest.get(thread.marker.id);

    if (disposition?.kind !== 'fixed') {
      return [];
    }

    const sha = disposition.value;
    const isNamed = input.commits.some((commit) => commit.startsWith(sha));

    return isNamed || input.ambiguous.includes(sha)
      ? []
      : [{ key: `${thread.marker.id}:${sha}`, sha, posted: thread.marker.head }];
  });

  const fixes = await Promise.all(
    answers.map(async (answer) => {
      const fix = await readRewrittenFix({
        sha: answer.sha,
        posted: answer.posted,
        candidates: input.commits,
      });

      return [answer.key, fix] as const;
    }),
  );

  return new Map(fixes);
}
