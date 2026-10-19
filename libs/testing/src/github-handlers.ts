import type { Endpoints } from '@octokit/types';
import { HttpResponse, http } from 'msw';
import { P, match } from 'ts-pattern';
import { buildCommitFileData } from './build-commit-file-data';
import { buildCompareData } from './build-compare-data';
import { githubCollections } from './github-collections';
import { toPage } from './to-page';

export const GITHUB_API_URL = 'https://api.github.com';

// the login GitHub gives the App's own comments in the stand-in
export const STUB_APP_LOGIN = 'noslop-review[bot]';

type Data<Route extends keyof Endpoints> = Endpoints[Route]['response']['data'];

interface CommentUser {
  user: { login: string; type: string };
}

type PullComment = Data<'GET /repos/{owner}/{repo}/pulls/{pull_number}/comments'>[number];

type ReviewCommentData = Pick<PullComment, 'id' | 'path' | 'body' | 'in_reply_to_id'> &
  Pick<PullComment, 'commit_id' | 'created_at' | 'line' | 'start_line'> &
  Pick<PullComment, 'original_line' | 'original_start_line'> &
  CommentUser;

type IssueCommentData = Pick<
  Data<'GET /repos/{owner}/{repo}/issues/{issue_number}/comments'>[number],
  'id' | 'body' | 'created_at'
> &
  CommentUser;

interface RepoParams {
  owner: string;
  repo: string;
}

interface PullParams extends RepoParams {
  number: string;
}

interface CommentParams extends PullParams {
  commentID: string;
}

interface ReviewCommentInput {
  commit_id: string;
  path: string;
  line: number;
  start_line?: number;
  body: string;
}

interface ReviewInput {
  commit_id: string;
  event: string;
  body?: string;
  comments?: Omit<ReviewCommentInput, 'commit_id'>[];
}

interface BodyInput {
  body: string;
}

interface IssueInput {
  title: string;
  body?: string;
}

interface CheckRunInput {
  name: string;
  head_sha: string;
  status?: string;
  conclusion?: string;
  output?: { title?: string; summary?: string; text?: string };
}

// the routes the GitHub adapter calls, answered from the stand-in's collections; the literal routes
// come before their parameterised siblings on purpose, because MSW matches in registration order
export const githubHandlers = [
  http.post(`${GITHUB_API_URL}/app/installations/:installationID/access_tokens`, () =>
    HttpResponse.json(
      {
        token: 'ghs_stand_in',
        expires_at: '2099-01-01T00:00:00Z',
        permissions: {},
        repository_selection: 'all' as const,
      } satisfies Pick<
        Data<'POST /app/installations/{installation_id}/access_tokens'>,
        'token' | 'expires_at' | 'permissions' | 'repository_selection'
      >,
      { status: 201 },
    ),
  ),

  http.get(`${GITHUB_API_URL}/app`, () =>
    HttpResponse.json({ slug: STUB_APP_LOGIN.replace('[bot]', '') }),
  ),

  http.get<RepoParams & { ref: string }>(
    `${GITHUB_API_URL}/repos/:owner/:repo/commits/:ref`,
    (info) => {
      const commit = githubCollections.pullCommits.findFirst((query) =>
        query.where({
          owner: info.params.owner,
          repo: info.params.repo,
          sha: (sha) => sha.startsWith(info.params.ref),
        }),
      );

      if (commit === undefined) {
        return buildNotFound();
      }

      // GitHub pages the files of a commit, so a large commit lists them over several requests
      return HttpResponse.json({
        sha: commit.sha,
        files: toPage(info.request, commit.files).map((filename) =>
          buildCommitFileData(commit, filename),
        ),
      });
    },
  ),

  // the pull request commits after the base up to the head, oldest first, as GitHub's compare lists
  // the commits a merge of the head would bring onto the base
  http.get<RepoParams & { basehead: string }>(
    `${GITHUB_API_URL}/repos/:owner/:repo/compare/:basehead`,
    (info) => {
      const [base = '', head = ''] = info.params.basehead.split('...');

      const records = githubCollections.pullCommits.findMany((query) =>
        query.where({ owner: info.params.owner, repo: info.params.repo }),
      );

      const search = new URL(info.request.url).searchParams;

      return match(buildCompareData(records, { base, head, search }))
        .with('ambiguous', () =>
          HttpResponse.json({ message: 'No common ancestor', status: '422' }, { status: 422 }),
        )
        .with(null, () => buildNotFound())
        .with({ status: P.union('ahead', 'behind', 'identical', 'diverged') }, (compare) =>
          HttpResponse.json(compare),
        )
        .exhaustive();
    },
  ),

  http.get<PullParams>(`${GITHUB_API_URL}/repos/:owner/:repo/pulls/:number`, (info) => {
    const pull = githubCollections.pullRequests.findFirst((query) =>
      query.where({
        owner: info.params.owner,
        repo: info.params.repo,
        number: Number(info.params.number),
      }),
    );

    if (pull === undefined) {
      return buildNotFound();
    }

    return HttpResponse.json({
      number: pull.number,
      title: pull.title,
      body: pull.body,
      base: { ref: pull.baseRef, sha: pull.baseSha },
      head: { sha: pull.headSha },
      user: { login: pull.authorLogin },
    });
  }),

  http.get<PullParams>(`${GITHUB_API_URL}/repos/:owner/:repo/pulls/:number/commits`, (info) => {
    const commits = githubCollections.pullCommits.findMany((query) =>
      query.where({
        owner: info.params.owner,
        repo: info.params.repo,
        number: Number(info.params.number),
        isOnBranch: true,
        isFromBase: false,
      }),
    );

    const page = toPage(info.request, commits);

    return HttpResponse.json(page.map((commit) => toCommitData(commit.sha)));
  }),

  http.get<PullParams>(`${GITHUB_API_URL}/repos/:owner/:repo/pulls/:number/comments`, (info) => {
    const comments = githubCollections.reviewComments.findMany((query) =>
      query.where({
        owner: info.params.owner,
        repo: info.params.repo,
        number: Number(info.params.number),
      }),
    );

    const page = toPage(info.request, comments);

    return HttpResponse.json(page.map((comment) => toReviewCommentData(comment)));
  }),

  http.post<PullParams, ReviewCommentInput>(
    `${GITHUB_API_URL}/repos/:owner/:repo/pulls/:number/comments`,
    async (info) => {
      const input = await info.request.json();

      const number = Number(info.params.number);

      if (!isCommentable(info.params, number, input)) {
        return buildUnresolvedLine(input);
      }

      const comment = await githubCollections.reviewComments.create({
        owner: info.params.owner,
        repo: info.params.repo,
        number,
        path: input.path,
        line: input.line,
        startLine: input.start_line ?? null,
        body: input.body,
        authorLogin: STUB_APP_LOGIN,
        authorType: 'Bot',
        commitID: input.commit_id,
      });

      return HttpResponse.json(toReviewCommentData(comment), { status: 201 });
    },
  ),

  http.post<PullParams, ReviewInput>(
    `${GITHUB_API_URL}/repos/:owner/:repo/pulls/:number/reviews`,
    async (info) => {
      const input = await info.request.json();

      const number = Number(info.params.number);
      const comments = input.comments ?? [];
      const outside = comments.find((comment) => !isCommentable(info.params, number, comment));

      if (outside !== undefined) {
        return buildUnresolvedLine(outside);
      }

      const review = await githubCollections.reviews.create({
        owner: info.params.owner,
        repo: info.params.repo,
        number,
        commitID: input.commit_id,
        event: input.event,
        body: input.body ?? '',
      });

      for (const comment of comments) {
        await githubCollections.reviewComments.create({
          owner: info.params.owner,
          repo: info.params.repo,
          number,
          path: comment.path,
          line: comment.line,
          startLine: comment.start_line ?? null,
          body: comment.body,
          authorLogin: STUB_APP_LOGIN,
          authorType: 'Bot',
          commitID: input.commit_id,
        });
      }

      return HttpResponse.json({ id: review.id });
    },
  ),

  http.post<CommentParams, BodyInput>(
    `${GITHUB_API_URL}/repos/:owner/:repo/pulls/:number/comments/:commentID/replies`,
    async (info) => {
      const parent = githubCollections.reviewComments.findFirst((query) =>
        query.where({
          owner: info.params.owner,
          repo: info.params.repo,
          id: Number(info.params.commentID),
        }),
      );

      if (parent === undefined) {
        return buildNotFound();
      }

      const input = await info.request.json();

      const reply = await githubCollections.reviewComments.create({
        owner: info.params.owner,
        repo: info.params.repo,
        number: parent.number,
        path: parent.path,
        line: parent.line,
        body: input.body,
        authorLogin: STUB_APP_LOGIN,
        authorType: 'Bot',
        inReplyToID: parent.id,
        commitID: parent.commitID,
      });

      return HttpResponse.json(toReviewCommentData(reply), { status: 201 });
    },
  ),

  http.patch<Omit<CommentParams, 'number'>, BodyInput>(
    `${GITHUB_API_URL}/repos/:owner/:repo/pulls/comments/:commentID`,
    async (info) => {
      const input = await info.request.json();

      const comment = await githubCollections.reviewComments.update(
        (query) =>
          query.where({
            owner: info.params.owner,
            repo: info.params.repo,
            id: Number(info.params.commentID),
          }),
        {
          data(record) {
            record.body = input.body;
          },
        },
      );

      if (comment === undefined) {
        return buildNotFound();
      }

      return HttpResponse.json(toReviewCommentData(comment));
    },
  ),

  http.patch<Omit<CommentParams, 'number'>, BodyInput>(
    `${GITHUB_API_URL}/repos/:owner/:repo/issues/comments/:commentID`,
    async (info) => {
      const input = await info.request.json();

      const comment = await githubCollections.issueComments.update(
        (query) =>
          query.where({
            owner: info.params.owner,
            repo: info.params.repo,
            id: Number(info.params.commentID),
          }),
        {
          data(record) {
            record.body = input.body;
          },
        },
      );

      if (comment === undefined) {
        return buildNotFound();
      }

      return HttpResponse.json(toIssueCommentData(comment));
    },
  ),

  http.get<PullParams>(`${GITHUB_API_URL}/repos/:owner/:repo/issues/:number/comments`, (info) => {
    const comments = githubCollections.issueComments.findMany((query) =>
      query.where({
        owner: info.params.owner,
        repo: info.params.repo,
        number: Number(info.params.number),
      }),
    );

    const page = toPage(info.request, comments);

    return HttpResponse.json(page.map((comment) => toIssueCommentData(comment)));
  }),

  http.post<PullParams, BodyInput>(
    `${GITHUB_API_URL}/repos/:owner/:repo/issues/:number/comments`,
    async (info) => {
      const input = await info.request.json();

      const comment = await githubCollections.issueComments.create({
        owner: info.params.owner,
        repo: info.params.repo,
        number: Number(info.params.number),
        body: input.body,
        authorLogin: STUB_APP_LOGIN,
        authorType: 'Bot',
      });

      return HttpResponse.json(toIssueCommentData(comment), { status: 201 });
    },
  ),

  http.get<PullParams>(`${GITHUB_API_URL}/repos/:owner/:repo/issues/:number`, (info) => {
    const issue = githubCollections.issues.findFirst((query) =>
      query.where({
        owner: info.params.owner,
        repo: info.params.repo,
        number: Number(info.params.number),
      }),
    );

    if (issue === undefined) {
      return buildNotFound();
    }

    return HttpResponse.json({ number: issue.number, title: issue.title, body: issue.body });
  }),

  http.post<RepoParams, IssueInput>(`${GITHUB_API_URL}/repos/:owner/:repo/issues`, async (info) => {
    const input = await info.request.json();

    const numbers = githubCollections.issues
      .findMany((query) => query.where({ owner: info.params.owner, repo: info.params.repo }))
      .map((issue) => issue.number);

    const issue = await githubCollections.issues.create({
      owner: info.params.owner,
      repo: info.params.repo,
      number: Math.max(0, ...numbers) + 1,
      title: input.title,
      body: input.body ?? '',
      authorLogin: STUB_APP_LOGIN,
    });

    return HttpResponse.json({ number: issue.number, title: issue.title }, { status: 201 });
  }),

  // every issue of the repo, open or closed, as GitHub pages them
  http.get<RepoParams>(`${GITHUB_API_URL}/repos/:owner/:repo/issues`, (info) => {
    const issues = githubCollections.issues.findMany((query) =>
      query.where({ owner: info.params.owner, repo: info.params.repo }),
    );

    const page = toPage(info.request, issues);

    return HttpResponse.json(
      page.map((issue) => ({
        number: issue.number,
        title: issue.title,
        body: issue.body,
        user: { login: issue.authorLogin },
      })),
    );
  }),

  http.get<RepoParams & { login: string }>(
    `${GITHUB_API_URL}/repos/:owner/:repo/collaborators/:login/permission`,
    (info) => {
      const collaborator = githubCollections.collaborators.findFirst((query) =>
        query.where({ owner: info.params.owner, repo: info.params.repo, login: info.params.login }),
      );

      return HttpResponse.json({ permission: collaborator?.permission ?? 'none' });
    },
  ),

  http.post<RepoParams, CheckRunInput>(
    `${GITHUB_API_URL}/repos/:owner/:repo/check-runs`,
    async (info) => {
      const input = await info.request.json();

      const run = await githubCollections.checkRuns.create({
        owner: info.params.owner,
        repo: info.params.repo,
        name: input.name,
        headSha: input.head_sha,
        status: input.status ?? 'queued',
        conclusion: input.conclusion ?? null,
        title: input.output?.title ?? '',
        summary: input.output?.summary ?? '',
        text: input.output?.text ?? '',
      });

      return HttpResponse.json({ id: run.id, name: run.name }, { status: 201 });
    },
  ),

  http.get<RepoParams & { branch: string[] }>(
    `${GITHUB_API_URL}/repos/:owner/:repo/branches/:branch+`,
    (info) => {
      const name = info.params.branch.join('/');

      const branch = githubCollections.branches.findFirst((query) =>
        query.where({ owner: info.params.owner, repo: info.params.repo, name }),
      );

      if (branch === undefined) {
        return buildNotFound();
      }

      return HttpResponse.json({ name: branch.name, commit: { sha: branch.sha } });
    },
  ),

  http.get<RepoParams & { path: string[] }>(
    `${GITHUB_API_URL}/repos/:owner/:repo/contents/:path+`,
    (info) => {
      const ref = new URL(info.request.url).searchParams.get('ref') ?? 'main';

      const file = githubCollections.files.findFirst((query) =>
        query.where({
          owner: info.params.owner,
          repo: info.params.repo,
          ref,
          path: info.params.path.join('/'),
        }),
      );

      if (file === undefined) {
        return buildNotFound();
      }

      return HttpResponse.json({
        type: 'file',
        encoding: 'base64',
        path: file.path,
        content: Buffer.from(file.content).toString('base64'),
      });
    },
  ),
];

function buildNotFound() {
  return HttpResponse.json(
    { message: 'Not Found', documentation_url: 'https://docs.github.com/rest', status: '404' },
    { status: 404 },
  );
}

function buildUnresolvedLine(comment: Pick<ReviewCommentInput, 'path' | 'line'>) {
  return HttpResponse.json(
    {
      message: 'Unprocessable Entity',
      errors: [`Line could not be resolved: ${comment.path}:${comment.line}`],
    },
    { status: 422 },
  );
}

// GitHub takes a review comment only on a line of the pull request's diff
function isCommentable(
  repo: RepoParams,
  number: number,
  comment: Pick<ReviewCommentInput, 'path' | 'line' | 'start_line'>,
): boolean {
  const file = githubCollections.pullFiles.findFirst((query) =>
    query.where({ owner: repo.owner, repo: repo.repo, number, path: comment.path }),
  );

  const lines = [comment.start_line ?? comment.line, comment.line];

  return file !== undefined && lines.every((line) => file.lines.includes(line));
}

function toCommitData(
  sha: string,
): Pick<Data<'GET /repos/{owner}/{repo}/pulls/{pull_number}/commits'>[number], 'sha'> {
  return { sha };
}

function toReviewCommentData(
  comment: ReturnType<typeof githubCollections.reviewComments.all>[number],
): ReviewCommentData {
  return {
    id: comment.id,
    path: comment.path,
    line: comment.line,
    start_line: comment.startLine,
    original_line: comment.originalLine ?? comment.line,
    original_start_line: comment.originalStartLine ?? comment.startLine,
    body: comment.body,
    ...(comment.inReplyToID === null ? {} : { in_reply_to_id: comment.inReplyToID }),
    commit_id: comment.commitID,
    created_at: comment.createdAt,
    user: { login: comment.authorLogin, type: comment.authorType },
  };
}

function toIssueCommentData(
  comment: ReturnType<typeof githubCollections.issueComments.all>[number],
): IssueCommentData {
  return {
    id: comment.id,
    body: comment.body,
    created_at: comment.createdAt,
    user: { login: comment.authorLogin, type: comment.authorType },
  };
}
