import { expect, mock, test } from 'bun:test';
import { getLogger } from '@logtape/logtape';
import {
  GITHUB_API_URL,
  STUB_APP_LOGIN,
  buildMockFinding,
  buildMockReviewResult,
  buildStubAppKey,
  createStubReplyDuringWrite,
  githubCollections,
  githubServer,
} from '@noslop/testing';
import { HttpResponse, http } from 'msw';
import { createGitHubConnection } from './create-github-connection';
import { createGitHubReporter } from './create-github-reporter';
import { readPullRequestState } from './read-pull-request-state';
import { runGitHubCheck } from './run-github-check';

function setupTest() {
  const privateKey = buildStubAppKey();

  const reporter = createGitHubReporter({
    loadConnection: () => createGitHubConnection({ appID: 1, privateKey, installationID: 7 }),
  });

  return { reporter, logger: getLogger(['test']) };
}

test('it posts a review with an inline comment per finding, the summary, and a failing check', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    baseSha: 'a'.repeat(40),
    headSha: 'b'.repeat(40),
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    sha: 'b'.repeat(40),
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1, 2, 3],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      findings: [
        buildMockFinding({
          id: '1111111111111111',
          anchor: { path: 'src/a.ts', startLine: 2, endLine: 3 },
        }),
      ],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const comments = githubCollections.reviewComments.all();
  const checks = githubCollections.checkRuns.all();
  const summaries = githubCollections.issueComments.all();

  expect(githubCollections.reviews.all()).toMatchObject([
    { number: 5, commitID: 'b'.repeat(40), event: 'COMMENT' },
  ]);

  expect(
    comments.map((comment) => [comment.path, comment.startLine, comment.line, comment.authorLogin]),
  ).toStrictEqual([['src/a.ts', 2, 3, STUB_APP_LOGIN]]);

  expect(comments[0]?.body).toInclude('`1111111111111111`');

  expect(summaries.map((comment) => comment.body)).toSatisfyAll((body: string) =>
    body.startsWith('### noslop'),
  );

  expect(checks).toMatchObject([
    {
      name: 'noslop',
      headSha: 'b'.repeat(40),
      conclusion: 'failure',
      title: '1 findings hold no valid disposition.',
    },
  ]);
});

test('it puts a finding outside the diff in an issue comment that people answer by its id', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'b'.repeat(40),
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [
        buildMockFinding({ id: '1111111111111111' }),
        buildMockFinding({
          id: '2222222222222222',
          title: 'Close the consumer',
          writtenByChange: false,
          anchor: { path: 'src/consumer.ts', startLine: 40, endLine: 40 },
        }),
      ],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const inline = githubCollections.reviewComments.all().map((comment) => comment.path);
  const issueComments = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(inline).toStrictEqual(['src/a.ts']);
  expect(issueComments.filter((body) => body.includes('`2222222222222222`'))).toHaveLength(1);
});

test('it confirms a fixed finding on the re-review and passes the check', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    sha: 'b'.repeat(40),
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    sha: 'c'.repeat(40),
    files: ['src/a.ts'],
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summary).toHaveLength(1);
  expect(summary[0]).toInclude('✅ Return the total of every item: fixed in');

  expect(githubCollections.checkRuns.all().map((run) => run.conclusion)).toStrictEqual([
    'failure',
    'success',
  ]);
});

test('it confirms a fix that a merge from the base branch brought in by its own sha', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    sha: 'b'.repeat(40),
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    sha: 'e'.repeat(40),
    files: ['src/a.ts'],
    isFromBase: true,
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    sha: 'c'.repeat(40),
    files: ['src/a.ts'],
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'e'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summary[0]).toInclude('✅ Return the total of every item: fixed in');

  expect(githubCollections.checkRuns.all().map((run) => run.conclusion)).toStrictEqual([
    'failure',
    'success',
  ]);
});

test('it confirms a fix that landed in the layer below a stacked pull request from a fixes-only run whose range starts below it', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    sha: 'b'.repeat(40),
    isOnBranch: false,
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    sha: 'e'.repeat(40),
    files: ['src/a.ts'],
    isFromBase: true,
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    sha: 'c'.repeat(40),
    files: ['src/a.ts'],
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'e'.repeat(40)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'a'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
      fixChecks: [{ findingID: '1111111111111111', fixed: true, reason: 'The total adds up.' }],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summary[0]).toInclude('✅ Return the total of every item: fixed in');

  expect(githubCollections.checkRuns.all().map((run) => run.conclusion)).toStrictEqual([
    'failure',
    'success',
  ]);
});

test('it passes the check on a fix answered after the re-review that read it, with no further review', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    sha: 'b'.repeat(40),
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    sha: 'c'.repeat(40),
    files: ['src/a.ts'],
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  const connection = await createGitHubConnection({
    appID: 1,
    privateKey: buildStubAppKey(),
    installationID: 7,
  });

  const outcome = await runGitHubCheck(
    connection,
    { owner: 'example', repo: 'app', number: 5 },
    { failedReporters: [] },
  );

  expect(outcome.conclusion).toBe('success');

  expect(githubCollections.checkRuns.all().map((run) => run.conclusion)).toStrictEqual([
    'failure',
    'failure',
    'success',
  ]);
});

test('it keeps a fix answered after the re-review that read it confirmed on the next review', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'd'.repeat(40),
  });

  for (const sha of ['b', 'c', 'd']) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha: sha.repeat(40),
      files: ['src/a.ts'],
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'c'.repeat(40),
      head: 'd'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summary[0]).toInclude(`"confirmed":["1111111111111111:${'c'.repeat(7)}"]`);

  expect(githubCollections.checkRuns.all().map((run) => run.conclusion)).toStrictEqual([
    'failure',
    'failure',
    'success',
  ]);
});

test('it fails the check without throwing on a fixed sha that names no commit', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'b'.repeat(40),
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    sha: 'b'.repeat(40),
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: 'fixed 1234567',
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  const connection = await createGitHubConnection({
    appID: 1,
    privateKey: buildStubAppKey(),
    installationID: 7,
  });

  const outcome = await runGitHubCheck(
    connection,
    { owner: 'example', repo: 'app', number: 5 },
    { failedReporters: [] },
  );

  expect(outcome.open.map((item) => item.reason)).toStrictEqual([
    'the commit 1234567 is not on the branch',
  ]);
});

test('it leaves a finding open whose fixed sha starts both a commit of the pull request and a merged-in commit', async () => {
  const ctx = setupTest();
  const own = 'abc1234'.padEnd(40, 'a');
  const merged = 'abc1234'.padEnd(40, 'b');

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    sha: 'f'.repeat(40),
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    sha: own,
    files: ['src/a.ts'],
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    sha: merged,
    files: ['src/a.ts'],
    isFromBase: true,
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    sha: 'c'.repeat(40),
    files: ['src/a.ts'],
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'f'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'f'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: 'fixed abc1234',
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  const connection = await createGitHubConnection({
    appID: 1,
    privateKey: buildStubAppKey(),
    installationID: 7,
  });

  const outcome = await runGitHubCheck(
    connection,
    { owner: 'example', repo: 'app', number: 5 },
    { failedReporters: [] },
  );

  expect(outcome.open.map((item) => item.reason)).toStrictEqual([
    'the sha abc1234 matches more than one commit on the branch, so give more of it',
  ]);
});

test('it fails the check without throwing on a fixed sha that GitHub finds ambiguous', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'b'.repeat(40),
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    sha: 'b'.repeat(40),
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: 'fixed 7654321',
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  githubServer.use(
    http.get(
      `${GITHUB_API_URL}/repos/:owner/:repo/compare/7654321...${'b'.repeat(40)}`,
      () => new HttpResponse(null, { status: 422 }),
    ),
  );

  const connection = await createGitHubConnection({
    appID: 1,
    privateKey: buildStubAppKey(),
    installationID: 7,
  });

  const outcome = await runGitHubCheck(
    connection,
    { owner: 'example', repo: 'app', number: 5 },
    { failedReporters: [] },
  );

  expect(outcome.open.map((item) => item.reason)).toStrictEqual([
    'the commit 7654321 is not on the branch',
  ]);
});

test('it passes the check on a late fix past the first 250 commits of the re-review range', async () => {
  const ctx = setupTest();
  const shas = Array.from({ length: 262 }, (_, index) => index.toString(16).padStart(40, '0'));
  const posted = shas[0] ?? '';
  const fix = shas[256] ?? '';
  const head = shas[261] ?? '';

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: head,
  });

  for (const sha of shas) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha,
      files: ['src/a.ts'],
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: posted,
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: posted,
      head,
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${fix}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  const connection = await createGitHubConnection({
    appID: 1,
    privateKey: buildStubAppKey(),
    installationID: 7,
  });

  const outcome = await runGitHubCheck(
    connection,
    { owner: 'example', repo: 'app', number: 5 },
    { failedReporters: [] },
  );

  expect(outcome.conclusion).toBe('success');
});

test('it passes the check on a fix answered while the next review publishes, from the review that read it', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'd'.repeat(40),
  });

  for (const sha of ['b', 'c', 'd']) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha: sha.repeat(40),
      files: ['src/a.ts'],
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  githubServer.use(
    createStubReplyDuringWrite({
      owner: 'example',
      repo: 'app',
      number: 5,
      body: `fixed ${'c'.repeat(7)}`,
      authorLogin: 'dev',
      inReplyToID: thread?.id ?? null,
    }),
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'c'.repeat(40),
      head: 'd'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  expect(githubCollections.checkRuns.all().map((run) => run.conclusion)).toStrictEqual([
    'failure',
    'failure',
    'success',
  ]);
});

test('it fails the check when a review after a late confirmed fix reports the finding again and an unrelated push follows', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'd'.repeat(40),
  });

  for (const sha of ['a', 'b', 'c', 'd']) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha: sha.repeat(40),
      files: ['src/a.ts'],
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'a'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111', lens: 'security' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'b'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111', lens: 'security' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'c'.repeat(40),
      head: 'd'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  expect(githubCollections.checkRuns.all().map((run) => run.conclusion)).toStrictEqual([
    'failure',
    'failure',
    'failure',
    'failure',
  ]);

  expect(githubCollections.checkRuns.all().at(-1)?.summary).toInclude(
    `no re-review has read the commit ${'b'.repeat(7)} yet`,
  );
});

test('it fails the check when a review after a confirmed fix reports the finding again and an unrelated push follows', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'e'.repeat(40),
  });

  for (const sha of ['b', 'c', 'd', 'e']) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha: sha.repeat(40),
      files: ['src/a.ts'],
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'c'.repeat(40),
      head: 'd'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'd'.repeat(40),
      head: 'e'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('failure');

  expect(githubCollections.checkRuns.all().at(-1)?.summary).toInclude(
    `no re-review has read the commit ${'c'.repeat(7)} yet`,
  );
});

test('it keeps an earlier review range through reposts of the latest review', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'd'.repeat(40),
  });

  for (const sha of ['b', 'c', 'd']) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha: sha.repeat(40),
      files: ['src/a.ts'],
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const latest = buildMockReviewResult({
    pullRequest: { owner: 'example', repo: 'app', number: 5 },
    base: 'c'.repeat(40),
    head: 'd'.repeat(40),
    findings: [],
  });

  for (let post = 0; post < 5; post += 1) {
    await ctx.reporter.report(latest, { logger: ctx.logger, options: {}, failedReporters: [] });
  }

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  const connection = await createGitHubConnection({
    appID: 1,
    privateKey: buildStubAppKey(),
    installationID: 7,
  });

  const outcome = await runGitHubCheck(
    connection,
    { owner: 'example', repo: 'app', number: 5 },
    { failedReporters: [] },
  );

  expect(outcome.conclusion).toBe('success');
});

test('it leaves a finding open whose fixed commit comes after the head', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  for (const sha of ['b', 'c']) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha: sha.repeat(40),
      files: ['src/a.ts'],
    });
  }

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    sha: 'e'.repeat(40),
    files: ['src/a.ts'],
    isFromBase: true,
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'e'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  const connection = await createGitHubConnection({
    appID: 1,
    privateKey: buildStubAppKey(),
    installationID: 7,
  });

  const outcome = await runGitHubCheck(
    connection,
    { owner: 'example', repo: 'app', number: 5 },
    { failedReporters: [] },
  );

  expect(outcome.open.map((item) => item.reason)).toStrictEqual([
    `the commit ${'e'.repeat(7)} is not on the branch`,
  ]);
});

test('it leaves a finding open whose fixed commit has diverged from the head', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  for (const sha of ['b', 'c']) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha: sha.repeat(40),
      files: ['src/a.ts'],
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: 'fixed 9876543',
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  githubServer.use(
    http.get(`${GITHUB_API_URL}/repos/:owner/:repo/compare/9876543...${'c'.repeat(40)}`, () =>
      HttpResponse.json({
        status: 'diverged',
        merge_base_commit: { sha: 'b'.repeat(40) },
        commits: [{ sha: 'c'.repeat(40) }],
        files: [],
      }),
    ),
  );

  const connection = await createGitHubConnection({
    appID: 1,
    privateKey: buildStubAppKey(),
    installationID: 7,
  });

  const outcome = await runGitHubCheck(
    connection,
    { owner: 'example', repo: 'app', number: 5 },
    { failedReporters: [] },
  );

  expect(outcome.open.map((item) => item.reason)).toStrictEqual([
    'the commit 9876543 is not on the branch',
  ]);
});

test('it confirms no fix answered after a re-review whose calls failed', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'd'.repeat(40),
  });

  for (const sha of ['b', 'c', 'd']) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha: sha.repeat(40),
      files: ['src/a.ts'],
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
      failedCalls: [{ id: 'light', lenses: ['correctness'], reason: 'the call timed out' }],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'c'.repeat(40),
      head: 'd'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  expect(githubCollections.checkRuns.all().map((run) => run.conclusion)).toStrictEqual([
    'failure',
    'failure',
    'failure',
  ]);

  expect(githubCollections.checkRuns.all().at(-1)?.summary).toInclude(
    `no re-review has read the commit ${'c'.repeat(7)} yet`,
  );
});

test('it fails the check when a review whose calls failed reports a late confirmed fix again and the next review skips its file', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'e'.repeat(40),
  });

  for (const sha of ['b', 'c', 'd', 'e']) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha: sha.repeat(40),
      files: ['src/a.ts'],
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'c'.repeat(40),
      head: 'd'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
      failedCalls: [{ id: 'light', lenses: ['correctness'], reason: 'the call timed out' }],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'c'.repeat(40),
      head: 'e'.repeat(40),
      findings: [],
      notReviewed: [{ path: 'src/a.ts', reason: 'too-large' }],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('failure');

  expect(githubCollections.checkRuns.all().at(-1)?.summary).toInclude(
    `no re-review has read the commit ${'c'.repeat(7)} yet`,
  );
});

test('it fails the check when a review reports a late confirmed fix again and a later review of the same range skips its file', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'd'.repeat(40),
  });

  for (const sha of ['b', 'c', 'd']) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha: sha.repeat(40),
      files: ['src/a.ts'],
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'c'.repeat(40),
      head: 'd'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'c'.repeat(40),
      head: 'd'.repeat(40),
      findings: [],
      notReviewed: [{ path: 'src/a.ts', reason: 'too-large' }],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('failure');

  expect(githubCollections.checkRuns.all().at(-1)?.summary).toInclude(
    `no re-review has read the commit ${'c'.repeat(7)} yet`,
  );
});

test('it fails the check when a review whose range passes the marker budget reports a late confirmed fix again', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'e'.repeat(40),
  });

  for (const sha of ['b', 'c', 'd', 'e']) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha: sha.repeat(40),
      files: ['src/a.ts'],
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'c'.repeat(40),
      head: 'd'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
      notReviewed: Array.from({ length: 60 }, (_, index) => ({
        path: `data/${String(index).padStart(3, '0')}-${'x'.repeat(290)}.jsonl`,
        reason: 'data' as const,
      })),
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'd'.repeat(40),
      head: 'e'.repeat(40),
      findings: [],
      notReviewed: [{ path: 'src/a.ts', reason: 'too-large' }],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('failure');

  expect(githubCollections.checkRuns.all().at(-1)?.summary).toInclude(
    `no re-review has read the commit ${'c'.repeat(7)} yet`,
  );
});

test('it fails the check when the summary marker of the App holds a kept range it cannot read', async () => {
  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${'c'.repeat(40)}","base":"${'b'.repeat(40)}","notReviewed":[],"earlier":[{"base":"${'a'.repeat(40)}","head":"${'b'.repeat(40)}","notReviewed":[]}],"reviews":2,"reported":[],"failedCalls":0,"followUps":[],"confirmed":[]} -->`,
  });

  const connection = await createGitHubConnection({
    appID: 1,
    privateKey: buildStubAppKey(),
    installationID: 7,
  });

  const outcome = await runGitHubCheck(
    connection,
    { owner: 'example', repo: 'app', number: 5 },
    { failedReporters: [] },
  );

  expect(outcome.conclusion).toBe('failure');
  expect(outcome.title).toBe(`No noslop review for this commit, ${'c'.repeat(12)}.`);
});

test('it fails the check when a review reports a late confirmed fix again and more reviews follow than the marker keeps', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: '2'.repeat(40),
  });

  for (const sha of ['b', 'c', 'd', 'e', 'f', '1', '2']) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha: sha.repeat(40),
      files: ['src/a.ts'],
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'c'.repeat(40),
      head: 'd'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  for (const [base, head] of [
    ['d', 'e'],
    ['e', 'f'],
    ['f', '1'],
    ['1', '2'],
  ] as const) {
    await ctx.reporter.report(
      buildMockReviewResult({
        pullRequest: { owner: 'example', repo: 'app', number: 5 },
        base: base.repeat(40),
        head: head.repeat(40),
        findings: [],
        notReviewed: [{ path: 'src/a.ts', reason: 'too-large' }],
      }),
      { logger: ctx.logger, options: {}, failedReporters: [] },
    );
  }

  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('failure');

  expect(githubCollections.checkRuns.all().at(-1)?.summary).toInclude(
    `no re-review has read the commit ${'c'.repeat(7)} yet`,
  );
});

test('it fails the check when a review reports a confirmed fix again under the path its file was renamed to', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'd'.repeat(40),
  });

  for (const [sha, file] of [
    ['b', 'src/a.ts'],
    ['c', 'src/a.ts'],
    ['d', 'src/b.ts'],
  ] as const) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha: sha.repeat(40),
      files: [file],
    });
  }

  for (const path of ['src/a.ts', 'src/b.ts']) {
    await githubCollections.pullFiles.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      path,
      lines: [1],
    });
  }

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'c'.repeat(40),
      head: 'd'.repeat(40),
      findings: [
        buildMockFinding({
          id: '2222222222222222',
          anchor: { path: 'src/b.ts', startLine: 1, endLine: 1 },
        }),
      ],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const connection = await createGitHubConnection({
    appID: 1,
    privateKey: buildStubAppKey(),
    installationID: 7,
  });

  const outcome = await runGitHubCheck(
    connection,
    { owner: 'example', repo: 'app', number: 5 },
    { failedReporters: [] },
  );

  expect(outcome.open).toStrictEqual([
    { id: '2222222222222222', title: 'Return the total of every item', reason: 'no disposition' },
  ]);
});

test('it keeps the latest review range and the 4 newest earlier ones after 6 reviews', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: '1'.repeat(40),
  });

  for (const sha of ['b', 'c', 'd', 'e', 'f', '1']) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha: sha.repeat(40),
    });
  }

  for (const [base, head] of [
    ['a', 'b'],
    ['b', 'c'],
    ['c', 'd'],
    ['d', 'e'],
    ['e', 'f'],
    ['f', '1'],
  ] as const) {
    await ctx.reporter.report(
      buildMockReviewResult({
        pullRequest: { owner: 'example', repo: 'app', number: 5 },
        base: base.repeat(40),
        head: head.repeat(40),
        findings: [],
      }),
      { logger: ctx.logger, options: {}, failedReporters: [] },
    );
  }

  const connection = await createGitHubConnection({
    appID: 1,
    privateKey: buildStubAppKey(),
    installationID: 7,
  });

  const state = await readPullRequestState(connection, {
    owner: 'example',
    repo: 'app',
    number: 5,
  });

  expect(state.summary?.marker).toMatchObject({ base: 'f'.repeat(40), head: '1'.repeat(40) });

  expect(state.summary?.marker.earlier?.map((range) => range.head)).toStrictEqual([
    'f'.repeat(40),
    'e'.repeat(40),
    'd'.repeat(40),
    'c'.repeat(40),
  ]);
});

test('it keeps no range in the summary marker of a review that left out more paths than the marker holds', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'b'.repeat(40),
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    sha: 'b'.repeat(40),
  });

  const notReviewed = Array.from({ length: 60 }, (_, index) => ({
    path: `data/${String(index).padStart(3, '0')}-${'x'.repeat(290)}.jsonl`,
    reason: 'data' as const,
  }));

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [],
      notReviewed,
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const connection = await createGitHubConnection({
    appID: 1,
    privateKey: buildStubAppKey(),
    installationID: 7,
  });

  const state = await readPullRequestState(connection, {
    owner: 'example',
    repo: 'app',
    number: 5,
  });

  expect(state.summary?.marker).toMatchObject({ head: 'b'.repeat(40), reviews: 1 });
  expect(state.summary?.marker).not.toContainAnyKeys(['base', 'notReviewed']);
});

test('it keeps no range in the summary marker when the left-out paths pass the budget only before their escapes', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'b'.repeat(40),
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    sha: 'b'.repeat(40),
  });

  const notReviewed = Array.from({ length: 60 }, (_, index) => ({
    path: `data/${String(index).padStart(3, '0')}-${'>'.repeat(190)}.jsonl`,
    reason: 'data' as const,
  }));

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [],
      notReviewed,
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const connection = await createGitHubConnection({
    appID: 1,
    privateKey: buildStubAppKey(),
    installationID: 7,
  });

  const state = await readPullRequestState(connection, {
    owner: 'example',
    repo: 'app',
    number: 5,
  });

  expect(state.summary?.marker).toMatchObject({ head: 'b'.repeat(40), reviews: 1 });
  expect(state.summary?.marker).not.toContainAnyKeys(['base', 'notReviewed']);
});

test('it strikes the comment of a confirmed fix and keeps its marker for the check', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    sha: 'b'.repeat(40),
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    sha: 'c'.repeat(40),
    files: ['src/a.ts'],
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();
  const posted = thread?.body ?? '';

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const struck = githubCollections.reviewComments.findFirst((query) =>
    query.where({ id: thread?.id ?? -1 }),
  );

  const connection = await createGitHubConnection({
    appID: 1,
    privateKey: buildStubAppKey(),
    installationID: 7,
  });

  const state = await readPullRequestState(connection, {
    owner: 'example',
    repo: 'app',
    number: 5,
  });

  expect(struck?.body).toStartWith(
    '~~**P2 · Correctness** · Return the total of every item~~\n✅ Fixed in `ccccccc`\n',
  );

  expect(struck?.body.slice(struck.body.indexOf('<!-- noslop:finding '))).toBe(
    posted.slice(posted.indexOf('<!-- noslop:finding ')),
  );

  expect(state.threads.map((item) => item.marker.id)).toStrictEqual(['1111111111111111']);
  expect(state.unreadable).toBe(0);

  expect(githubCollections.checkRuns.all().map((run) => run.conclusion)).toStrictEqual([
    'failure',
    'success',
  ]);
});

test('it restores the comment of a confirmed fix once a later review reports the finding again', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'd'.repeat(40),
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    sha: 'b'.repeat(40),
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    sha: 'c'.repeat(40),
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    sha: 'd'.repeat(40),
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();
  const posted = thread?.body ?? '';

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'c'.repeat(40),
      head: 'd'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const restored = githubCollections.reviewComments.findFirst((query) =>
    query.where({ id: thread?.id ?? -1 }),
  );

  expect(restored?.body).toBe(posted);
});

test('it links each finding in the summary table to its comment', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'b'.repeat(40),
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [
        buildMockFinding({ id: '1111111111111111' }),
        buildMockFinding({
          id: '2222222222222222',
          title: 'Close the consumer',
          anchor: { path: 'src/consumer.ts', startLine: 40, endLine: 40 },
        }),
      ],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [inline] = githubCollections.reviewComments.all();

  const unanchored = githubCollections.issueComments.findFirst((query) =>
    query.where({ body: (body) => body.includes('<!-- noslop:finding ') }),
  );

  const summary = githubCollections.issueComments.findFirst((query) =>
    query.where({ body: (body) => body.includes('<!-- noslop:summary ') }),
  );

  expect(summary?.body).toInclude(
    `| P2 | [Return the total of every item](https://github.com/example/app/pull/5#discussion_r${inline?.id}) | \`a.ts:1\` |`,
  );

  expect(summary?.body).toInclude(
    `| P2 | [Close the consumer](https://github.com/example/app/pull/5#issuecomment-${unanchored?.id}) | \`consumer.ts:40\` |`,
  );
});

test('it hands the link to each finding comment to the comment link recorder', async () => {
  const privateKey = buildStubAppKey();
  const recordCommentURLs = mock(() => Promise.resolve());

  const reporter = createGitHubReporter({
    loadConnection: () => createGitHubConnection({ appID: 1, privateKey, installationID: 7 }),
    recordCommentURLs,
  });

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'b'.repeat(40),
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [
        buildMockFinding({ id: '1111111111111111' }),
        buildMockFinding({
          id: '2222222222222222',
          title: 'Close the consumer',
          anchor: { path: 'src/consumer.ts', startLine: 40, endLine: 40 },
        }),
      ],
    }),
    { logger: getLogger(['test']), options: {}, failedReporters: [] },
  );

  const [inline] = githubCollections.reviewComments.all();

  const unanchored = githubCollections.issueComments.findFirst((query) =>
    query.where({ body: (body) => body.includes('<!-- noslop:finding ') }),
  );

  expect(recordCommentURLs).toHaveBeenCalledExactlyOnceWith(
    { owner: 'example', repo: 'app', number: 5 },
    new Map([
      ['1111111111111111', `https://github.com/example/app/pull/5#discussion_r${inline?.id}`],
      ['2222222222222222', `https://github.com/example/app/pull/5#issuecomment-${unanchored?.id}`],
    ]),
  );
});

test('it fails the check when the re-review still finds a fixed finding, and posts it once', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    sha: 'c'.repeat(40),
    files: ['src/a.ts'],
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: githubCollections.reviewComments.all()[0]?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'c'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const roots = githubCollections.reviewComments.findMany((query) =>
    query.where({ inReplyToID: null }),
  );

  expect(roots).toHaveLength(1);

  expect(githubCollections.checkRuns.all().at(-1)).toMatchObject({
    conclusion: 'failure',
    summary:
      '1 findings hold no valid disposition.\n- `1111111111111111` Return the total of every item: the re-review still finds it',
  });
});

test('it files a new finding in code the change did not write as one issue after the re-check', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'd'.repeat(40),
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  for (const head of ['b', 'c']) {
    await ctx.reporter.report(
      buildMockReviewResult({
        reviewID: `review-${head}`,
        pullRequest: { owner: 'example', repo: 'app', number: 5 },
        head: head.repeat(40),
        findings: [],
      }),
      { logger: ctx.logger, options: {}, failedReporters: [] },
    );
  }

  for (const run of [1, 2]) {
    await ctx.reporter.report(
      buildMockReviewResult({
        reviewID: `review-${run}`,
        pullRequest: { owner: 'example', repo: 'app', number: 5 },
        head: 'd'.repeat(40),
        findings: [
          buildMockFinding({
            id: '1111111111111111',
            title: 'Close the old file',
            writtenByChange: false,
          }),
          buildMockFinding({ id: '2222222222222222', title: 'Await the new write' }),
        ],
      }),
      { logger: ctx.logger, options: {}, failedReporters: [] },
    );
  }

  expect(githubCollections.issues.all().map((issue) => issue.title)).toStrictEqual([
    'Close the old file',
  ]);

  expect(githubCollections.reviewComments.all().map((comment) => comment.body)).toSatisfyAll(
    (body: string) => body.includes('Await the new write'),
  );
});

test('it counts a second post of one review result as one review', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'b'.repeat(40),
  });

  const result = buildMockReviewResult({
    reviewID: 'review-7',
    pullRequest: { owner: 'example', repo: 'app', number: 5 },
    head: 'b'.repeat(40),
  });

  await ctx.reporter.report(result, { logger: ctx.logger, options: {}, failedReporters: [] });
  await ctx.reporter.report(result, { logger: ctx.logger, options: {}, failedReporters: [] });

  const summaries = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summaries).toHaveLength(1);
  expect(summaries[0]).toInclude('"reviews":1,"reviewIDs":["review-7"]');
});

test('it sets the check from the current answers when an earlier review is retried after a later one', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'b'.repeat(40),
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  const first = buildMockReviewResult({
    reviewID: 'review-a',
    pullRequest: { owner: 'example', repo: 'app', number: 5 },
    head: 'b'.repeat(40),
    findings: [buildMockFinding({ id: '1111111111111111' })],
  });

  const second = buildMockReviewResult({
    reviewID: 'review-b',
    pullRequest: { owner: 'example', repo: 'app', number: 5 },
    head: 'b'.repeat(40),
    findings: [],
  });

  await ctx.reporter.report(first, { logger: ctx.logger, options: {}, failedReporters: [] });
  await ctx.reporter.report(second, { logger: ctx.logger, options: {}, failedReporters: [] });

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: 'not-a-defect The total already leaves refunds out.',
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  const before = githubCollections.checkRuns.all().at(-1)?.conclusion;

  await ctx.reporter.report(first, { logger: ctx.logger, options: {}, failedReporters: [] });

  const summaries = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(before).toBe('failure');
  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('success');
  expect(summaries).toHaveLength(1);
  expect(summaries[0]).toInclude('"reviewIDs":["review-a","review-b"],"reported":[]');
});

test('it keeps the later summary when an earlier review is retried after it', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'b'.repeat(40),
  });

  const first = buildMockReviewResult({
    reviewID: 'review-a',
    pullRequest: { owner: 'example', repo: 'app', number: 5 },
    head: 'b'.repeat(40),
    findings: [buildMockFinding({ id: '2222222222222222', title: 'Check the empty list' })],
  });

  const second = buildMockReviewResult({
    reviewID: 'review-b',
    pullRequest: { owner: 'example', repo: 'app', number: 5 },
    head: 'b'.repeat(40),
    findings: [],
  });

  await ctx.reporter.report(first, { logger: ctx.logger, options: {}, failedReporters: [] });
  await ctx.reporter.report(second, { logger: ctx.logger, options: {}, failedReporters: [] });
  await ctx.reporter.report(first, { logger: ctx.logger, options: {}, failedReporters: [] });

  const summaries = githubCollections.issueComments
    .all()
    .map((comment) => comment.body)
    .filter((body) => body.includes('<!-- noslop:summary'));

  expect(summaries).toHaveLength(1);
  expect(summaries[0]).toInclude('"reviewIDs":["review-a","review-b"],"reported":[]');
});

test('it counts a retry of an earlier review as no new review after another review posted', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'b'.repeat(40),
  });

  const first = buildMockReviewResult({
    reviewID: 'review-a',
    pullRequest: { owner: 'example', repo: 'app', number: 5 },
    head: 'b'.repeat(40),
  });

  const second = buildMockReviewResult({
    reviewID: 'review-b',
    pullRequest: { owner: 'example', repo: 'app', number: 5 },
    head: 'b'.repeat(40),
  });

  await ctx.reporter.report(first, { logger: ctx.logger, options: {}, failedReporters: [] });
  await ctx.reporter.report(second, { logger: ctx.logger, options: {}, failedReporters: [] });
  await ctx.reporter.report(first, { logger: ctx.logger, options: {}, failedReporters: [] });

  const summaries = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summaries).toHaveLength(1);
  expect(summaries[0]).toInclude('"reviews":2,"reviewIDs":["review-a","review-b"]');
});

test('it runs a queued post of a pull request after the post before it fails at the summary', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'b'.repeat(40),
  });

  githubServer.use(
    http.post(
      `${GITHUB_API_URL}/repos/:owner/:repo/issues/:number/comments`,
      () => new HttpResponse(null, { status: 500 }),
      { once: true },
    ),
  );

  const first = buildMockReviewResult({
    reviewID: 'review-a',
    pullRequest: { owner: 'example', repo: 'app', number: 5 },
    head: 'b'.repeat(40),
    findings: [],
  });

  const second = buildMockReviewResult({
    reviewID: 'review-b',
    pullRequest: { owner: 'example', repo: 'app', number: 5 },
    head: 'b'.repeat(40),
    findings: [],
  });

  const [failed, queued] = await Promise.allSettled([
    ctx.reporter.report(first, { logger: ctx.logger, options: {}, failedReporters: [] }),
    ctx.reporter.report(second, { logger: ctx.logger, options: {}, failedReporters: [] }),
  ]);

  const summaries = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(failed).toMatchObject({ status: 'rejected', reason: { status: 500 } });
  expect(queued).toStrictEqual({ status: 'fulfilled', value: undefined });
  expect(summaries).toHaveLength(1);
  expect(summaries[0]).toInclude('"reviews":1,"reviewIDs":["review-b"]');
});

test('it keeps a later summary and its check when an earlier review that failed at the summary is retried', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'b'.repeat(40),
  });

  githubServer.use(
    http.post(
      `${GITHUB_API_URL}/repos/:owner/:repo/issues/:number/comments`,
      () => new HttpResponse(null, { status: 500 }),
      { once: true },
    ),
  );

  const first = buildMockReviewResult({
    reviewID: 'review-a',
    pullRequest: { owner: 'example', repo: 'app', number: 5 },
    head: 'b'.repeat(40),
    startedAt: '2026-10-17T10:00:00.000Z',
    findings: [],
  });

  const second = buildMockReviewResult({
    reviewID: 'review-b',
    pullRequest: { owner: 'example', repo: 'app', number: 5 },
    head: 'b'.repeat(40),
    startedAt: '2026-10-17T10:05:00.000Z',
    findings: [],
    failedCalls: [{ id: 'light', lenses: ['correctness'], reason: 'the call timed out' }],
  });

  const failed = await ctx.reporter
    .report(first, { logger: ctx.logger, options: {}, failedReporters: [] })
    .then(
      () => null,
      (error: unknown) => error,
    );

  await ctx.reporter.report(second, { logger: ctx.logger, options: {}, failedReporters: [] });
  await ctx.reporter.report(first, { logger: ctx.logger, options: {}, failedReporters: [] });

  const summaries = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(failed).toMatchObject({ status: 500 });
  expect(summaries).toHaveLength(1);
  expect(summaries[0]).toInclude('"reviews":1,"reviewIDs":["review-b"]');
  expect(summaries[0]).toInclude('"failedCalls":1');
  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('failure');
});

test('it files one follow-up issue when 2 posts of one review run at once', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'd'.repeat(40),
  });

  for (const head of ['b', 'c']) {
    await ctx.reporter.report(
      buildMockReviewResult({
        reviewID: `review-${head}`,
        pullRequest: { owner: 'example', repo: 'app', number: 5 },
        head: head.repeat(40),
        findings: [],
      }),
      { logger: ctx.logger, options: {}, failedReporters: [] },
    );
  }

  const result = buildMockReviewResult({
    reviewID: 'review-d',
    pullRequest: { owner: 'example', repo: 'app', number: 5 },
    head: 'd'.repeat(40),
    findings: [
      buildMockFinding({
        id: '1111111111111111',
        title: 'Close the old file',
        writtenByChange: false,
      }),
    ],
  });

  await Promise.all([
    ctx.reporter.report(result, { logger: ctx.logger, options: {}, failedReporters: [] }),
    ctx.reporter.report(result, { logger: ctx.logger, options: {}, failedReporters: [] }),
  ]);

  expect(githubCollections.issues.all().map((issue) => issue.title)).toStrictEqual([
    'Close the old file',
  ]);
});

test('it files a follow-up issue that a marker of another author or another pull request names', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'd'.repeat(40),
  });

  await githubCollections.issues.create({
    owner: 'example',
    repo: 'app',
    number: 1,
    title: 'Copied by hand',
    body: '<!-- noslop:follow-up {"id":"1111111111111111","pullRequest":5} -->',
    authorLogin: 'dev',
  });

  await githubCollections.issues.create({
    owner: 'example',
    repo: 'app',
    number: 2,
    title: 'Filed from another pull request',
    body: '<!-- noslop:follow-up {"id":"1111111111111111","pullRequest":6} -->',
    authorLogin: STUB_APP_LOGIN,
  });

  for (const head of ['b', 'c']) {
    await ctx.reporter.report(
      buildMockReviewResult({
        reviewID: `review-${head}`,
        pullRequest: { owner: 'example', repo: 'app', number: 5 },
        head: head.repeat(40),
        findings: [],
      }),
      { logger: ctx.logger, options: {}, failedReporters: [] },
    );
  }

  await ctx.reporter.report(
    buildMockReviewResult({
      reviewID: 'review-d',
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'd'.repeat(40),
      findings: [
        buildMockFinding({
          id: '1111111111111111',
          title: 'Close the old file',
          writtenByChange: false,
        }),
      ],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  expect(githubCollections.issues.all().map((issue) => issue.title)).toStrictEqual([
    'Copied by hand',
    'Filed from another pull request',
    'Close the old file',
  ]);
});

test('it files a follow-up issue once when a post that opened it fails at the summary and is retried', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'd'.repeat(40),
  });

  for (const head of ['b', 'c']) {
    await ctx.reporter.report(
      buildMockReviewResult({
        reviewID: `review-${head}`,
        pullRequest: { owner: 'example', repo: 'app', number: 5 },
        head: head.repeat(40),
        findings: [],
      }),
      { logger: ctx.logger, options: {}, failedReporters: [] },
    );
  }

  githubServer.use(
    http.patch(
      `${GITHUB_API_URL}/repos/:owner/:repo/issues/comments/:commentID`,
      () => new HttpResponse(null, { status: 500 }),
      { once: true },
    ),
  );

  const result = buildMockReviewResult({
    reviewID: 'review-d',
    pullRequest: { owner: 'example', repo: 'app', number: 5 },
    head: 'd'.repeat(40),
    findings: [
      buildMockFinding({
        id: '1111111111111111',
        title: 'Close the old file',
        writtenByChange: false,
      }),
    ],
  });

  const failed = await ctx.reporter
    .report(result, { logger: ctx.logger, options: {}, failedReporters: [] })
    .then(
      () => null,
      (error: unknown) => error,
    );

  const filedBeforeRetry = githubCollections.issues.all().map((issue) => issue.title);

  await ctx.reporter.report(result, { logger: ctx.logger, options: {}, failedReporters: [] });

  expect(failed).toMatchObject({ status: 500 });
  expect(filedBeforeRetry).toStrictEqual(['Close the old file']);

  expect(githubCollections.issues.all().map((issue) => issue.title)).toStrictEqual([
    'Close the old file',
  ]);
});

test('it answers a free-text reply once with the accepted forms', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'b'.repeat(40),
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: 'Good catch, I will look.',
    authorLogin: 'dev',
    inReplyToID: githubCollections.reviewComments.all()[0]?.id ?? null,
  });

  for (const run of [1, 2]) {
    await ctx.reporter.report(
      buildMockReviewResult({
        reviewID: `review-${run}`,
        pullRequest: { owner: 'example', repo: 'app', number: 5 },
        head: 'b'.repeat(40),
        findings: [buildMockFinding({ id: '1111111111111111' })],
      }),
      { logger: ctx.logger, options: {}, failedReporters: [] },
    );
  }

  const answers = githubCollections.reviewComments.findMany((query) =>
    query.where({
      authorType: 'Bot',
      body: (body) => body.startsWith('That reply is not a disposition.'),
    }),
  );

  expect(answers).toHaveLength(1);
});

test('it fails the check when a reporter before it failed', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'b'.repeat(40),
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
    }),
    { logger: ctx.logger, options: {}, failedReporters: ['sqlite'] },
  );

  expect(githubCollections.checkRuns.all()).toMatchObject([
    { conclusion: 'failure', summary: 'These reporters failed: sqlite.' },
  ]);
});

test('it fails the check on a finding comment of the App whose marker it cannot read', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'b'.repeat(40),
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: '<!-- noslop:finding {"id":"1111111111111111","title":"Await the write"} -->',
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  expect(githubCollections.checkRuns.all()).toMatchObject([
    { conclusion: 'failure', title: '1 finding comments hold a marker noslop cannot read.' },
  ]);
});

test('it trusts no state that another bot posted', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'b'.repeat(40),
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    authorLogin: 'other-app[bot]',
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${'b'.repeat(40)}","reviews":9,"reported":[],"failedCalls":0} -->`,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const own = githubCollections.issueComments.findMany((query) =>
    query.where({ authorLogin: STUB_APP_LOGIN }),
  );

  expect(own.map((comment) => comment.body)).toSatisfyAll((body: string) =>
    body.includes('"reviews":1,'),
  );
});

test('it confirms a fix whose commit changes only another file, such as a test', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  for (const commit of [
    { sha: 'b'.repeat(40), files: ['src/a.ts'] },
    { sha: 'c'.repeat(40), files: ['src/a.test.ts'] },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      ...commit,
    });
  }

  for (const path of ['src/a.ts', 'src/a.test.ts']) {
    await githubCollections.pullFiles.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      path,
      lines: [1],
    });
  }

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summary[0]).toInclude(
    '✅ Return the total of every item: fixed in `ccccccc` (in other files of the pull request)',
  );

  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('success');
});

test('it leaves a fix in another file open while the re-review still reports the finding', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  for (const commit of [
    { sha: 'b'.repeat(40), files: ['src/a.ts'] },
    { sha: 'c'.repeat(40), files: ['src/a.test.ts'] },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      ...commit,
    });
  }

  for (const path of ['src/a.ts', 'src/a.test.ts']) {
    await githubCollections.pullFiles.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      path,
      lines: [1],
    });
  }

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summary[0]).toInclude('❌ Return the total of every item: not fixed in `ccccccc`');
  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('failure');
});

test('it confirms no fix whose commit changes no file of the pull request', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  for (const commit of [
    { sha: 'b'.repeat(40), files: ['src/a.ts'] },
    { sha: 'c'.repeat(40), files: ['docs/notes.md'] },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      ...commit,
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summary[0]).toInclude(
    '❌ Return the total of every item: not fixed in `ccccccc` (the commit changes no file of the pull request)',
  );

  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('failure');
});

test('it confirms no fix on a pull request whose file list GitHub cuts at its cap, and says why', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  for (const commit of [
    { sha: 'b'.repeat(40), files: ['src/a.ts'] },
    { sha: 'c'.repeat(40), files: ['src/a.ts'] },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      ...commit,
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await Promise.all(
    Array.from({ length: 2999 }, (_, index) =>
      githubCollections.pullFiles.create({
        owner: 'example',
        repo: 'app',
        number: 5,
        path: `src/generated/${index}.ts`,
        lines: [1],
      }),
    ),
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summary[0]).toInclude(
    '❌ Return the total of every item: not fixed in `ccccccc` (the pull request changes more files than GitHub lists)',
  );

  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('failure');
});

test('it confirms no fix on a file the re-review left out', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  for (const commit of [
    { sha: 'b'.repeat(40), files: ['src/a.ts'] },
    { sha: 'c'.repeat(40), files: ['src/a.ts'] },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      ...commit,
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
      notReviewed: [{ path: 'src/a.ts', reason: 'too-large' }],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summary[0]).toInclude('❌ Return the total of every item: not fixed in');
  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('failure');
});

test('it leaves a fix that a fixes-only run left unjudged as too large unconfirmed, says why, and reports no finding again', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  for (const commit of [
    { sha: 'b'.repeat(40), files: ['src/a.ts'] },
    { sha: 'c'.repeat(40), files: ['src/a.ts'] },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      ...commit,
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      lenses: [],
      findings: [],
      fixChecks: [],
      notReviewed: [{ path: 'src/a.ts', reason: 'too-large' }],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments
    .all()
    .findLast((comment) => comment.body.includes('<!-- noslop:summary'));

  expect(summary?.body).toInclude(
    '(unjudged: its diff passes the file limit, so no call read it whole)',
  );

  expect(summary?.body).toInclude('"reported":[]');
});

test("it confirms no fix on a file the re-review's call of the finding's lens left out while another lens read it", async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  for (const commit of [
    { sha: 'b'.repeat(40), files: ['src/a.ts'] },
    { sha: 'c'.repeat(40), files: ['src/a.ts'] },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      ...commit,
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111', lens: 'correctness' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      lenses: ['correctness', 'intent'],
      findings: [],
      notReviewed: [],
      notReviewedByLens: [{ path: 'src/a.ts', lenses: ['correctness'] }],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summary[0]).toInclude('❌ Return the total of every item: not fixed in');
  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('failure');
});

test("it confirms a fix on a file the re-review's call of the finding's lens read while another lens left it out", async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  for (const commit of [
    { sha: 'b'.repeat(40), files: ['src/a.ts'] },
    { sha: 'c'.repeat(40), files: ['src/a.ts'] },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      ...commit,
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111', lens: 'intent' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      lenses: ['correctness', 'intent'],
      findings: [],
      notReviewed: [],
      notReviewedByLens: [{ path: 'src/a.ts', lenses: ['correctness'] }],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summary[0]).toInclude('✅ Return the total of every item: fixed in');
  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('success');
});

test("it fails the check on a fix answered after a re-review whose call of the finding's lens left out its file", async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  for (const commit of [
    { sha: 'b'.repeat(40), files: ['src/a.ts'] },
    { sha: 'c'.repeat(40), files: ['src/a.ts'] },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      ...commit,
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111', lens: 'correctness' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      lenses: ['correctness', 'intent'],
      findings: [],
      notReviewed: [],
      notReviewedByLens: [{ path: 'src/a.ts', lenses: ['correctness'] }],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  const connection = await createGitHubConnection({
    appID: 1,
    privateKey: buildStubAppKey(),
    installationID: 7,
  });

  const outcome = await runGitHubCheck(
    connection,
    { owner: 'example', repo: 'app', number: 5 },
    { failedReporters: [] },
  );

  expect(outcome.conclusion).toBe('failure');
});

test("it fails the check on a late fix after a later review when the earlier review's call of the finding's lens left out its file", async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'd'.repeat(40),
  });

  for (const commit of [
    { sha: 'b'.repeat(40), files: ['src/a.ts'] },
    { sha: 'c'.repeat(40), files: ['src/a.ts'] },
    { sha: 'd'.repeat(40), files: ['src/b.ts'] },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      ...commit,
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111', lens: 'correctness' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      lenses: ['correctness', 'intent'],
      findings: [],
      notReviewed: [],
      notReviewedByLens: [{ path: 'src/a.ts', lenses: ['correctness'] }],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'c'.repeat(40),
      head: 'd'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  const connection = await createGitHubConnection({
    appID: 1,
    privateKey: buildStubAppKey(),
    installationID: 7,
  });

  const outcome = await runGitHubCheck(
    connection,
    { owner: 'example', repo: 'app', number: 5 },
    { failedReporters: [] },
  );

  expect(outcome.conclusion).toBe('failure');
});

test('it confirms no fix whose commit changes a file the re-review left out', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  for (const commit of [
    { sha: 'b'.repeat(40), files: ['src/a.ts'] },
    { sha: 'c'.repeat(40), files: ['src/a.test.ts'] },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      ...commit,
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
      notReviewed: [{ path: 'src/a.test.ts', reason: 'too-large' }],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summary[0]).toInclude('❌ Return the total of every item: not fixed in');
  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('failure');
});

test("it confirms no fix whose commit changes a file the re-review's call of the finding's lens left out", async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  for (const commit of [
    { sha: 'b'.repeat(40), files: ['src/a.ts'] },
    { sha: 'c'.repeat(40), files: ['src/a.test.ts'] },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      ...commit,
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111', lens: 'correctness' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      lenses: ['correctness', 'intent'],
      findings: [],
      notReviewed: [],
      notReviewedByLens: [{ path: 'src/a.test.ts', lenses: ['correctness'] }],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summary[0]).toInclude('❌ Return the total of every item: not fixed in');
  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('failure');
});

test('it confirms no fix whose commit renames a skipped file to a reviewed path', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  for (const commit of [
    { sha: 'b'.repeat(40), files: ['src/a.ts'] },
    {
      sha: 'c'.repeat(40),
      files: ['src/table.ts'],
      renames: { 'src/table.ts': 'samples/table.ts' },
    },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      ...commit,
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
      notReviewed: [{ path: 'samples/table.ts', reason: 'data' }],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summary[0]).toInclude('❌ Return the total of every item: not fixed in');
  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('failure');
});

test('it confirms no fix and names the failure when GitHub cannot compare the fix commit with the head', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'd'.repeat(40),
  });

  for (const commit of [
    { sha: 'b'.repeat(40), files: ['src/a.ts'] },
    { sha: 'c'.repeat(40), files: ['src/a.ts'] },
    { sha: 'd'.repeat(40), files: ['src/b.ts'] },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      ...commit,
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  githubServer.use(
    http.get(
      `${GITHUB_API_URL}/repos/:owner/:repo/compare/${'c'.repeat(40)}...${'d'.repeat(40)}`,
      () => new HttpResponse(null, { status: 500 }),
    ),
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'd'.repeat(40),
      findings: [],
      notReviewed: [{ path: 'samples/corpus.jsonl', reason: 'data' }],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summary[0]).toInclude(
    '❌ Return the total of every item: not fixed in `ccccccc` (GitHub could not compare the fix commit with the head (HTTP 500))',
  );

  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('failure');
});

test('it confirms no fix when the commits after it change more files than GitHub compares', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'd'.repeat(40),
  });

  for (const commit of [
    { sha: 'b'.repeat(40), files: ['src/a.ts'] },
    { sha: 'c'.repeat(40), files: ['src/a.ts'] },
    {
      sha: 'd'.repeat(40),
      files: Array.from({ length: 300 }, (_, index) => `src/table-${index}.ts`),
    },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      ...commit,
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'd'.repeat(40),
      findings: [],
      notReviewed: [{ path: 'samples/corpus.jsonl', reason: 'data' }],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summary[0]).toInclude(
    '❌ Return the total of every item: not fixed in `ccccccc` (the commits after the fix change more files than GitHub lists)',
  );

  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('failure');
});

test('it confirms no fix whose file a later commit renames to a skipped path', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'd'.repeat(40),
  });

  for (const commit of [
    { sha: 'b'.repeat(40), files: ['src/a.ts'], renames: {} },
    { sha: 'c'.repeat(40), files: ['src/a.ts'], renames: {} },
    { sha: 'd'.repeat(40), files: ['samples/a.ts'], renames: { 'samples/a.ts': 'src/a.ts' } },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      ...commit,
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'd'.repeat(40),
      findings: [],
      notReviewed: [{ path: 'samples/a.ts', reason: 'data' }],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summary[0]).toInclude('❌ Return the total of every item: not fixed in');
  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('failure');
});

test('it confirms no fix whose commit changes a skipped file on a later page of its files', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  for (const commit of [
    { sha: 'b'.repeat(40), files: ['src/a.ts'] },
    {
      sha: 'c'.repeat(40),
      files: [
        ...Array.from({ length: 100 }, (_, index) => `src/table-${index}.ts`),
        'samples/corpus.jsonl',
      ],
    },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      ...commit,
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
      notReviewed: [{ path: 'samples/corpus.jsonl', reason: 'data' }],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summary[0]).toInclude('❌ Return the total of every item: not fixed in');
  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('failure');
});

test('it confirms a fix whose commit lists its files over 2 pages and changes no skipped file', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  for (const commit of [
    { sha: 'b'.repeat(40), files: ['src/a.ts'] },
    {
      sha: 'c'.repeat(40),
      files: [...Array.from({ length: 100 }, (_, index) => `src/table-${index}.ts`), 'src/a.ts'],
    },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      ...commit,
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
      notReviewed: [{ path: 'samples/corpus.jsonl', reason: 'data' }],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summary[0]).toInclude('✅ Return the total of every item: fixed in');
  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('success');
});

test('it confirms no fix and names the failure when GitHub cannot list the files of the fix commit', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  for (const commit of [
    { sha: 'b'.repeat(40), files: ['src/a.ts'] },
    { sha: 'c'.repeat(40), files: ['src/a.ts'] },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      ...commit,
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  githubServer.use(
    http.get(
      `${GITHUB_API_URL}/repos/:owner/:repo/commits/:ref`,
      () => new HttpResponse(null, { status: 500 }),
    ),
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
      notReviewed: [{ path: 'samples/corpus.jsonl', reason: 'data' }],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summary[0]).toInclude(
    '❌ Return the total of every item: not fixed in `ccccccc` (GitHub could not list the files of the fix commit (HTTP 500))',
  );

  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('failure');
});

test('it confirms no fix whose commit lists more files than GitHub pages', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  for (const commit of [
    { sha: 'b'.repeat(40), files: ['src/a.ts'] },
    {
      sha: 'c'.repeat(40),
      files: Array.from({ length: 3000 }, (_, index) => `src/table-${index}.ts`),
    },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      ...commit,
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
      notReviewed: [{ path: 'samples/corpus.jsonl', reason: 'data' }],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summary[0]).toInclude(
    '❌ Return the total of every item: not fixed in `ccccccc` (the fix commit changes more files than GitHub lists)',
  );

  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('failure');
});

test('it confirms no fix whose commit the re-review range does not hold', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  for (const commit of [
    { sha: 'b'.repeat(40), files: ['src/a.ts'] },
    { sha: 'c'.repeat(40), files: ['README.md'] },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      ...commit,
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'b'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summary[0]).toInclude('❌ Return the total of every item: not fixed in');
  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('failure');
});

test('it confirms no fix through a commit before the head that posted the finding on a full review', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  for (const sha of ['a'.repeat(40), 'b'.repeat(40), 'c'.repeat(40)]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha,
      files: ['src/a.ts'],
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'a'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: '9'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summary[0]).toInclude('❌ Return the total of every item: not fixed in');
  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('failure');
});

test('it confirms no fix whose sha matches 2 commits on the branch', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'abc1234'.padEnd(40, 'c'),
  });

  for (const sha of ['abc1234'.padEnd(40, 'a'), 'b'.repeat(40), 'abc1234'.padEnd(40, 'c')]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha,
      files: ['src/a.ts'],
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: 'fixed abc1234',
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'abc1234'.padEnd(40, 'c'),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summary[0]).toInclude('❌ Return the total of every item: not fixed in');
  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('failure');
});

test('it drops a confirmed fix once a later commit shares its sha', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'abc1234'.padEnd(40, 'd'),
  });

  for (const sha of ['b'.repeat(40), 'abc1234'.padEnd(40, 'c'), 'abc1234'.padEnd(40, 'd')]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha,
      files: ['src/a.ts'],
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      reviewID: 'review-b',
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: 'fixed abc1234',
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  githubCollections.pullCommits.delete((query) => query.where({ sha: 'abc1234'.padEnd(40, 'd') }));

  await ctx.reporter.report(
    buildMockReviewResult({
      reviewID: 'review-c',
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'abc1234'.padEnd(40, 'c'),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    sha: 'abc1234'.padEnd(40, 'd'),
    files: ['README.md'],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      reviewID: 'review-d',
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'abc1234'.padEnd(40, 'c'),
      head: 'abc1234'.padEnd(40, 'd'),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summary[0]).toInclude('❌ Return the total of every item: not fixed in');
});

test('it keeps a rejected fix open after a later delta without the fix commit', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'd'.repeat(40),
  });

  for (const commit of [
    { sha: 'b'.repeat(40), files: ['src/a.ts'] },
    { sha: 'c'.repeat(40), files: ['src/a.ts'] },
    { sha: 'd'.repeat(40), files: ['README.md'] },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      ...commit,
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      reviewID: 'review-b',
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      reviewID: 'review-c',
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      reviewID: 'review-d',
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'c'.repeat(40),
      head: 'd'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summary[0]).toInclude('❌ Return the total of every item: not fixed in');
  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('failure');
});

test('it keeps a confirmed fix after a later delta without the fix commit', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'd'.repeat(40),
  });

  for (const commit of [
    { sha: 'b'.repeat(40), files: ['src/a.ts'] },
    { sha: 'c'.repeat(40), files: ['src/a.ts'] },
    { sha: 'd'.repeat(40), files: ['README.md'] },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      ...commit,
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      reviewID: 'review-b',
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  for (const range of [
    { reviewID: 'review-c', base: 'b'.repeat(40), head: 'c'.repeat(40) },
    { reviewID: 'review-d', base: 'c'.repeat(40), head: 'd'.repeat(40) },
  ]) {
    await ctx.reporter.report(
      buildMockReviewResult({
        pullRequest: { owner: 'example', repo: 'app', number: 5 },
        findings: [],
        ...range,
      }),
      { logger: ctx.logger, options: {}, failedReporters: [] },
    );
  }

  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('success');
});

test('it confirms a fix whose commit a rebase rewrote and passes the check', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'd'.repeat(40),
  });

  for (const commit of [
    { sha: 'a'.repeat(40), isOnBranch: false, patch: '@@ -1,1 +1,1 @@\n-a\n+b' },
    { sha: 'b'.repeat(40), isOnBranch: false, patch: '@@ -4,1 +4,1 @@\n-sum\n+total' },
    { sha: 'c'.repeat(40), isOnBranch: true, patch: '@@ -1,1 +1,1 @@\n-a\n+b' },
    { sha: 'd'.repeat(40), isOnBranch: true, patch: '@@ -7,1 +7,1 @@\n-sum\n+total' },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha: commit.sha,
      files: ['src/a.ts'],
      patches: { 'src/a.ts': commit.patch },
      isOnBranch: commit.isOnBranch,
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      reviewID: 'review-a',
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'a'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'b'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      reviewID: 'review-d',
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: '9'.repeat(40),
      head: 'd'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summary[0]).toInclude('✅ Return the total of every item: fixed in');
  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('success');
});

test('it confirms no fix whose rewritten commit never changed the file the branch commits change', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'd'.repeat(40),
  });

  for (const commit of [
    { sha: 'a'.repeat(40), isOnBranch: false, path: 'src/a.ts' },
    { sha: 'b'.repeat(40), isOnBranch: false, path: 'README.md' },
    { sha: 'c'.repeat(40), isOnBranch: true, path: 'src/a.ts' },
    { sha: 'd'.repeat(40), isOnBranch: true, path: 'src/a.ts' },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha: commit.sha,
      files: [commit.path],
      patches: { [commit.path]: `@@ -1,1 +1,1 @@\n-${commit.sha}\n+total` },
      isOnBranch: commit.isOnBranch,
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      reviewID: 'review-a',
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'a'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'b'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      reviewID: 'review-d',
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: '9'.repeat(40),
      head: 'd'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summary[0]).toInclude('❌ Return the total of every item: not fixed in');

  expect(githubCollections.checkRuns.all().at(-1)).toMatchObject({
    conclusion: 'failure',
    summary: expect.toInclude('the commit bbbbbbb is not on the branch'),
  });
});

test('it confirms no fix whose rewritten commit makes its change in a file other than the finding file', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'd'.repeat(40),
  });

  for (const commit of [
    { sha: 'a'.repeat(40), isOnBranch: false, path: 'src/a.ts', patch: '-a\n+b' },
    { sha: 'b'.repeat(40), isOnBranch: false, path: 'src/a.ts', patch: '-sum\n+total' },
    { sha: 'c'.repeat(40), isOnBranch: true, path: 'src/a.ts', patch: '-a\n+b' },
    { sha: 'd'.repeat(40), isOnBranch: true, path: 'src/b.ts', patch: '-sum\n+total' },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha: commit.sha,
      files: [commit.path],
      patches: { [commit.path]: `@@ -1,1 +1,1 @@\n${commit.patch}` },
      isOnBranch: commit.isOnBranch,
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      reviewID: 'review-a',
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'a'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'b'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      reviewID: 'review-d',
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: '9'.repeat(40),
      head: 'd'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summary[0]).toInclude('❌ Return the total of every item: not fixed in');

  expect(githubCollections.checkRuns.all().at(-1)).toMatchObject({
    conclusion: 'failure',
    summary: expect.toInclude('the commit bbbbbbb is not on the branch'),
  });
});

test('it confirms a fix whose commit changes only a test and whose rebased copy makes the same change', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'd'.repeat(40),
  });

  for (const commit of [
    { sha: 'a'.repeat(40), isOnBranch: false, path: 'src/a.ts', patch: '-a\n+b' },
    { sha: 'b'.repeat(40), isOnBranch: false, path: 'src/a.test.ts', patch: '+test total' },
    { sha: 'c'.repeat(40), isOnBranch: true, path: 'src/a.ts', patch: '-a\n+b' },
    { sha: 'd'.repeat(40), isOnBranch: true, path: 'src/a.test.ts', patch: '+test total' },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha: commit.sha,
      files: [commit.path],
      patches: { [commit.path]: `@@ -1,1 +1,1 @@\n${commit.patch}` },
      isOnBranch: commit.isOnBranch,
    });
  }

  for (const path of ['src/a.ts', 'src/a.test.ts']) {
    await githubCollections.pullFiles.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      path,
      lines: [1],
    });
  }

  await ctx.reporter.report(
    buildMockReviewResult({
      reviewID: 'review-a',
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'a'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'b'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      reviewID: 'review-d',
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: '9'.repeat(40),
      head: 'd'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summary[0]).toInclude('✅ Return the total of every item: fixed in');
  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('success');
});

test('it confirms no fix whose commit changes only a test and whose rebased copy changes that test differently', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'd'.repeat(40),
  });

  for (const commit of [
    { sha: 'a'.repeat(40), isOnBranch: false, path: 'src/a.ts', patch: '-a\n+b' },
    { sha: 'b'.repeat(40), isOnBranch: false, path: 'src/a.test.ts', patch: '+test total' },
    { sha: 'c'.repeat(40), isOnBranch: true, path: 'src/a.ts', patch: '-a\n+b' },
    { sha: 'd'.repeat(40), isOnBranch: true, path: 'src/a.test.ts', patch: '+test count' },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha: commit.sha,
      files: [commit.path],
      patches: { [commit.path]: `@@ -1,1 +1,1 @@\n${commit.patch}` },
      isOnBranch: commit.isOnBranch,
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      reviewID: 'review-a',
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'a'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'b'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      reviewID: 'review-d',
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: '9'.repeat(40),
      head: 'd'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summary[0]).toInclude('❌ Return the total of every item: not fixed in');

  expect(githubCollections.checkRuns.all().at(-1)).toMatchObject({
    conclusion: 'failure',
    summary: expect.toInclude('the commit bbbbbbb is not on the branch'),
  });
});

test('it keeps a fix whose commit a rebase rewrote after a later delta without the fix commit', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'e'.repeat(40),
  });

  for (const commit of [
    { sha: 'a'.repeat(40), isOnBranch: false, path: 'src/a.ts', patch: '-a\n+b' },
    { sha: 'b'.repeat(40), isOnBranch: false, path: 'src/a.ts', patch: '-sum\n+total' },
    { sha: 'c'.repeat(40), isOnBranch: true, path: 'src/a.ts', patch: '-a\n+b' },
    { sha: 'd'.repeat(40), isOnBranch: true, path: 'src/a.ts', patch: '-sum\n+total' },
    { sha: 'e'.repeat(40), isOnBranch: true, path: 'README.md', patch: '+docs' },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha: commit.sha,
      files: [commit.path],
      patches: { [commit.path]: `@@ -1,1 +1,1 @@\n${commit.patch}` },
      isOnBranch: commit.isOnBranch,
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      reviewID: 'review-a',
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'a'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'b'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  for (const range of [
    { reviewID: 'review-d', base: '9'.repeat(40), head: 'd'.repeat(40) },
    { reviewID: 'review-e', base: 'd'.repeat(40), head: 'e'.repeat(40) },
  ]) {
    await ctx.reporter.report(
      buildMockReviewResult({
        pullRequest: { owner: 'example', repo: 'app', number: 5 },
        findings: [],
        ...range,
      }),
      { logger: ctx.logger, options: {}, failedReporters: [] },
    );
  }

  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('success');
});

test('it confirms no rewritten fix for a finding posted after the fix commit when a repeat review holds the rewrite of an earlier finding', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'd'.repeat(40),
  });

  for (const commit of [
    { sha: 'a'.repeat(40), isOnBranch: false, patch: '-a\n+b' },
    { sha: 'b'.repeat(40), isOnBranch: false, patch: '-sum\n+total' },
    { sha: 'c'.repeat(40), isOnBranch: true, patch: '-a\n+b' },
    { sha: 'd'.repeat(40), isOnBranch: true, patch: '-sum\n+total' },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha: commit.sha,
      files: ['src/a.ts'],
      patches: { 'src/a.ts': `@@ -1,1 +1,1 @@\n${commit.patch}` },
      isOnBranch: commit.isOnBranch,
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  for (const posted of [
    {
      reviewID: 'review-a',
      head: 'a'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    },
    {
      reviewID: 'review-b',
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '2222222222222222', title: 'Name the retry' })],
    },
  ]) {
    await ctx.reporter.report(
      buildMockReviewResult({
        pullRequest: { owner: 'example', repo: 'app', number: 5 },
        ...posted,
      }),
      { logger: ctx.logger, options: {}, failedReporters: [] },
    );
  }

  const threadIDs = githubCollections.reviewComments.all().map((thread) => thread.id);

  for (const threadID of threadIDs) {
    await githubCollections.reviewComments.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      body: `fixed ${'b'.repeat(7)}`,
      authorLogin: 'dev',
      inReplyToID: threadID,
    });
  }

  for (const reviewID of ['review-d', 'review-d-again']) {
    await ctx.reporter.report(
      buildMockReviewResult({
        reviewID,
        pullRequest: { owner: 'example', repo: 'app', number: 5 },
        base: '9'.repeat(40),
        head: 'd'.repeat(40),
        findings: [],
      }),
      { logger: ctx.logger, options: {}, failedReporters: [] },
    );
  }

  const summary = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summary[0]).toInclude('✅ Return the total of every item: fixed in');
  expect(summary[0]).toInclude('❌ Name the retry: not fixed in');

  expect(githubCollections.checkRuns.all().at(-1)).toMatchObject({
    conclusion: 'failure',
    summary: expect.toInclude(
      '`2222222222222222` Name the retry: the commit bbbbbbb is not on the',
    ),
  });
});

test('it answers a free-text comment on a finding outside the diff once', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'b'.repeat(40),
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111', writtenByChange: false })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    authorLogin: 'dev',
    body: '1111111111111111 I will look at it.',
  });

  for (const run of [1, 2]) {
    await ctx.reporter.report(
      buildMockReviewResult({
        reviewID: `review-${run}`,
        pullRequest: { owner: 'example', repo: 'app', number: 5 },
        head: 'b'.repeat(40),
        findings: [buildMockFinding({ id: '1111111111111111', writtenByChange: false })],
      }),
      { logger: ctx.logger, options: {}, failedReporters: [] },
    );
  }

  const answers = githubCollections.issueComments.findMany((query) =>
    query.where({ body: (body) => body.startsWith('That reply is not a disposition.') }),
  );

  expect(answers).toHaveLength(1);
});

test('it refuses a result that names no pull request', () => {
  const ctx = setupTest();

  expect(
    ctx.reporter.report(buildMockReviewResult(), {
      logger: ctx.logger,
      options: {},
      failedReporters: [],
    }),
  ).rejects.toThrowWithMessage(
    Error,
    'the github reporter needs a pull request: run noslop review --pr <number>',
  );
});

test('it marks each merge whose resolution a fixes-only run judged sound as checked in the summary marker', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${'b'.repeat(40)}","base":"${'a'.repeat(40)}","reviews":2,"reported":[],"failedCalls":0,"checkedMerges":["${'d'.repeat(40)}"],"reviewIDs":["review-a","review-b"]} -->`,
  });

  const result = buildMockReviewResult({
    reviewID: 'review-c',
    pullRequest: { owner: 'example', repo: 'app', number: 5 },
    base: 'b'.repeat(40),
    head: 'c'.repeat(40),
    lenses: [],
    fixChecks: [],
    resolutionChecks: [
      {
        merge: 'e'.repeat(40),
        sound: true,
        reason: 'The merge keeps both timeouts.',
        findingIDs: [],
      },
      {
        merge: 'f'.repeat(40),
        sound: false,
        reason: 'The merge drops the retry limit.',
        findingIDs: [],
      },
    ],
  });

  await ctx.reporter.report(result, { logger: ctx.logger, options: {}, failedReporters: [] });

  const summary = githubCollections.issueComments
    .all()
    .findLast((comment) => comment.body.includes('<!-- noslop:summary'));

  expect(summary?.body).toInclude(`"checkedMerges":["${'d'.repeat(40)}","${'e'.repeat(40)}"]`);

  expect(summary?.body).toInclude(
    '✅ The resolution of merge `eeeeeee` holds: The merge keeps both timeouts.\n❌ The resolution of merge `fffffff` does not hold: The merge drops the retry limit.',
  );

  expect(summary?.body).toInclude('"reviews":2,');
});

test('it drops a merge from the checked merges when a later run judges its resolution not sound', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${'b'.repeat(40)}","base":"${'a'.repeat(40)}","reviews":2,"reported":[],"failedCalls":0,"checkedMerges":["${'e'.repeat(40)}"],"reviewIDs":["review-a","review-b"]} -->`,
  });

  const result = buildMockReviewResult({
    reviewID: 'review-c',
    pullRequest: { owner: 'example', repo: 'app', number: 5 },
    base: 'a'.repeat(40),
    head: 'c'.repeat(40),
    lenses: [],
    fixChecks: [],
    resolutionChecks: [
      {
        merge: 'e'.repeat(40),
        sound: false,
        reason: 'The merge drops the retry limit.',
        findingIDs: ['1111111111111111'],
      },
    ],
  });

  await ctx.reporter.report(result, { logger: ctx.logger, options: {}, failedReporters: [] });

  const summary = githubCollections.issueComments
    .all()
    .findLast((comment) => comment.body.includes('<!-- noslop:summary'));

  expect(summary?.body).toInclude('<!-- noslop:summary');
  expect(summary?.body).not.toInclude('checkedMerges');
});

test('it keeps a merge judged not sound with no finding as rejected and fails the check', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${'b'.repeat(40)}","base":"${'a'.repeat(40)}","reviews":2,"reported":[],"failedCalls":0,"reviewIDs":["review-a","review-b"]} -->`,
  });

  const result = buildMockReviewResult({
    reviewID: 'review-c',
    pullRequest: { owner: 'example', repo: 'app', number: 5 },
    base: 'b'.repeat(40),
    head: 'c'.repeat(40),
    lenses: [],
    fixChecks: [],
    resolutionChecks: [
      {
        merge: 'e'.repeat(40),
        sound: false,
        reason: 'noslop rebuilds a merge of 2 parents only, and this merge has 3',
        findingIDs: [],
      },
    ],
  });

  await ctx.reporter.report(result, { logger: ctx.logger, options: {}, failedReporters: [] });

  const summary = githubCollections.issueComments
    .all()
    .findLast((comment) => comment.body.includes('<!-- noslop:summary'));

  expect(summary?.body).toInclude(`"rejectedMerges":["${'e'.repeat(40)}"]`);

  expect(githubCollections.checkRuns.all().at(-1)).toMatchObject({
    conclusion: 'failure',
    title: 'The resolution of merge eeeeeeeeeeee does not hold.',
  });
});

test('it passes the check once the finding of a not-sound resolution holds a valid disposition', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${'b'.repeat(40)}","base":"${'a'.repeat(40)}","reviews":2,"reported":[],"failedCalls":0,"reviewIDs":["review-a","review-b"]} -->`,
  });

  const result = buildMockReviewResult({
    reviewID: 'review-c',
    pullRequest: { owner: 'example', repo: 'app', number: 5 },
    base: 'b'.repeat(40),
    head: 'c'.repeat(40),
    lenses: [],
    fixChecks: [],
    findings: [buildMockFinding({ id: '1111111111111111', title: 'Keep the 5000 ms timeout' })],
    resolutionChecks: [
      {
        merge: 'e'.repeat(40),
        sound: false,
        reason: 'The merge drops the timeout the base branch set.',
        findingIDs: ['1111111111111111'],
      },
    ],
  });

  await ctx.reporter.report(result, { logger: ctx.logger, options: {}, failedReporters: [] });

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: 'not-a-defect the base branch timeout is reverted on purpose',
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  const connection = await createGitHubConnection({
    appID: 1,
    privateKey: buildStubAppKey(),
    installationID: 7,
  });

  const outcome = await runGitHubCheck(
    connection,
    { owner: 'example', repo: 'app', number: 5 },
    { failedReporters: [] },
  );

  expect(outcome.conclusion).toBe('success');
});

test('it removes a rejected merge and passes the check when a later run judges its resolution sound', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${'b'.repeat(40)}","base":"${'a'.repeat(40)}","reviews":2,"reported":[],"failedCalls":0,"rejectedMerges":["${'e'.repeat(40)}"],"reviewIDs":["review-a","review-b"]} -->`,
  });

  const result = buildMockReviewResult({
    reviewID: 'review-c',
    pullRequest: { owner: 'example', repo: 'app', number: 5 },
    base: 'a'.repeat(40),
    head: 'c'.repeat(40),
    lenses: [],
    fixChecks: [],
    resolutionChecks: [
      {
        merge: 'e'.repeat(40),
        sound: true,
        reason: 'The merge keeps both timeouts.',
        findingIDs: [],
      },
    ],
  });

  await ctx.reporter.report(result, { logger: ctx.logger, options: {}, failedReporters: [] });

  const summary = githubCollections.issueComments
    .all()
    .findLast((comment) => comment.body.includes('<!-- noslop:summary'));

  expect(summary?.body).not.toInclude('rejectedMerges');
  expect(summary?.body).toInclude(`"checkedMerges":["${'e'.repeat(40)}"]`);
  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('success');
});

test('it keeps a rejected merge through a later fixes-only run that does not judge it', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${'b'.repeat(40)}","base":"${'a'.repeat(40)}","reviews":2,"reported":[],"failedCalls":0,"rejectedMerges":["${'e'.repeat(40)}"],"reviewIDs":["review-a","review-b"]} -->`,
  });

  const result = buildMockReviewResult({
    reviewID: 'review-c',
    pullRequest: { owner: 'example', repo: 'app', number: 5 },
    base: 'b'.repeat(40),
    head: 'c'.repeat(40),
    lenses: [],
    fixChecks: [],
  });

  await ctx.reporter.report(result, { logger: ctx.logger, options: {}, failedReporters: [] });

  const summary = githubCollections.issueComments
    .all()
    .findLast((comment) => comment.body.includes('<!-- noslop:summary'));

  expect(summary?.body).toInclude(`"rejectedMerges":["${'e'.repeat(40)}"]`);
});

test('it clears the rejected merges on a lens review', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${'b'.repeat(40)}","base":"${'a'.repeat(40)}","reviews":1,"reported":[],"failedCalls":0,"rejectedMerges":["${'e'.repeat(40)}"],"reviewIDs":["review-a"]} -->`,
  });

  const result = buildMockReviewResult({
    reviewID: 'review-b',
    pullRequest: { owner: 'example', repo: 'app', number: 5 },
    base: 'b'.repeat(40),
    head: 'c'.repeat(40),
  });

  await ctx.reporter.report(result, { logger: ctx.logger, options: {}, failedReporters: [] });

  const summary = githubCollections.issueComments
    .all()
    .findLast((comment) => comment.body.includes('<!-- noslop:summary'));

  expect(summary?.body).toInclude('<!-- noslop:summary');
  expect(summary?.body).not.toInclude('rejectedMerges');
  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('success');
});

test('it posts a finding whose lines a later commit rewrote as an issue comment that names its commit and lines', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  const result = buildMockReviewResult({
    pullRequest: { owner: 'example', repo: 'app', number: 5 },
    head: 'c'.repeat(40),
    findings: [buildMockFinding({ id: '1111111111111111', anchorCommit: 'e'.repeat(40) })],
  });

  await ctx.reporter.report(result, { logger: ctx.logger, options: {}, failedReporters: [] });

  const comments = githubCollections.issueComments
    .all()
    .map((comment) => comment.body)
    .filter((body) => body.includes('<!-- noslop:finding'));

  expect(githubCollections.reviewComments.all()).toStrictEqual([]);
  expect(comments).toHaveLength(1);

  expect(comments[0]).toStartWith(
    `This finding sits at \`src/a.ts:1-1\` of \`${'e'.repeat(40)}\`, and a later commit rewrote those lines, so GitHub cannot anchor it at the head. Answer it in a comment that starts with its id, \`1111111111111111\`.`,
  );

  expect(comments[0]).toInclude(`"head":"${'e'.repeat(40)}"`);
});

test('it passes the check at a rebased head whose files hold the reviewed patches at moved lines', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    baseSha: 'a'.repeat(40),
    headSha: 'b'.repeat(40),
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    patch: '@@ -1,3 +1,3 @@\n const zero = 0;\n-const one = 2;\n+const one = 1;\n const two = 2;',
    blobSha: '1'.repeat(40),
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'assets/logo.png',
    status: 'added',
    blobSha: '2'.repeat(40),
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await githubCollections.pullRequests.update((query) => query.where({ number: 5 }), {
    data(record) {
      record.baseSha = 'd'.repeat(40);
      record.headSha = 'c'.repeat(40);
    },
  });

  await githubCollections.pullFiles.update((query) => query.where({ path: 'src/a.ts' }), {
    data(record) {
      record.patch =
        '@@ -8,3 +8,3 @@\n const zero = 0;\n-const one = 2;\n+const one = 1;\n const two = 2;';

      record.blobSha = '3'.repeat(40);
    },
  });

  const connection = await createGitHubConnection({
    appID: 1,
    privateKey: buildStubAppKey(),
    installationID: 7,
  });

  const outcome = await runGitHubCheck(
    connection,
    { owner: 'example', repo: 'app', number: 5 },
    { failedReporters: [] },
  );

  expect(outcome.conclusion).toBe('success');
});

test('it fails the check at a new head whose file holds a changed patch, and names the file', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    baseSha: 'a'.repeat(40),
    headSha: 'b'.repeat(40),
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    patch: '@@ -1,3 +1,3 @@\n const zero = 0;\n-const one = 2;\n+const one = 1;\n const two = 2;',
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/b.ts',
    patch: '@@ -1 +1 @@\n-const name = "a";\n+const name = "b";',
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await githubCollections.pullRequests.update((query) => query.where({ number: 5 }), {
    data(record) {
      record.headSha = 'c'.repeat(40);
    },
  });

  await githubCollections.pullFiles.update((query) => query.where({ path: 'src/a.ts' }), {
    data(record) {
      record.patch =
        '@@ -1,3 +1,3 @@\n const zero = 0;\n-const one = 2;\n+const one = 3;\n const two = 2;';
    },
  });

  const connection = await createGitHubConnection({
    appID: 1,
    privateKey: buildStubAppKey(),
    installationID: 7,
  });

  const outcome = await runGitHubCheck(
    connection,
    { owner: 'example', repo: 'app', number: 5 },
    { failedReporters: [] },
  );

  expect(outcome.title).toBe(
    'No noslop review of this change to src/a.ts: the patch changed since the review of bbbbbbbbbbbb.',
  );
});

test('it keys a review on its head when the pull request moved on before the summary', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    baseSha: 'a'.repeat(40),
    headSha: 'c'.repeat(40),
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    patch: '@@ -1 +1 @@\n-const one = 2;\n+const one = 1;',
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const connection = await createGitHubConnection({
    appID: 1,
    privateKey: buildStubAppKey(),
    installationID: 7,
  });

  const state = await readPullRequestState(connection, {
    owner: 'example',
    repo: 'app',
    number: 5,
  });

  expect(state.summary?.marker.key).toStrictEqual({ head: 'b'.repeat(40) });
});

test('it keys a review on its head when the pull request changes more files than GitHub lists', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    baseSha: 'a'.repeat(40),
    headSha: 'b'.repeat(40),
  });

  await Promise.all(
    Array.from({ length: 3001 }, (_, index) =>
      githubCollections.pullFiles.create({
        owner: 'example',
        repo: 'app',
        number: 5,
        path: `src/file-${index}.ts`,
      }),
    ),
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const connection = await createGitHubConnection({
    appID: 1,
    privateKey: buildStubAppKey(),
    installationID: 7,
  });

  const state = await readPullRequestState(connection, {
    owner: 'example',
    repo: 'app',
    number: 5,
  });

  expect(state.summary?.marker.key).toStrictEqual({ head: 'b'.repeat(40) });
});

test('it passes the check on a fix answered after a merge of the base that left the net change alone', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    sha: 'b'.repeat(40),
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    sha: 'c'.repeat(40),
    files: ['src/a.ts'],
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
    patch: '@@ -1 +1 @@\n-const one = 2;\n+const one = 1;',
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    sha: 'd'.repeat(40),
  });

  await githubCollections.pullRequests.update((query) => query.where({ number: 5 }), {
    data(record) {
      record.headSha = 'd'.repeat(40);
    },
  });

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  const connection = await createGitHubConnection({
    appID: 1,
    privateKey: buildStubAppKey(),
    installationID: 7,
  });

  const outcome = await runGitHubCheck(
    connection,
    { owner: 'example', repo: 'app', number: 5 },
    { failedReporters: [] },
  );

  expect(outcome).toMatchObject({ conclusion: 'success', open: [], reviewed: true });
});

test('it passes the check on a late fix that names the commit a review read before a clean rebase', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'b'.repeat(40),
  });

  for (const commit of [
    { sha: 'a'.repeat(40), isOnBranch: false, patch: '@@ -1,1 +1,1 @@\n-a\n+b' },
    { sha: 'b'.repeat(40), isOnBranch: false, patch: '@@ -4,1 +4,1 @@\n-sum\n+total' },
    { sha: 'c'.repeat(40), isOnBranch: true, patch: '@@ -1,1 +1,1 @@\n-a\n+b' },
    { sha: 'd'.repeat(40), isOnBranch: true, patch: '@@ -7,1 +7,1 @@\n-sum\n+total' },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha: commit.sha,
      files: ['src/a.ts'],
      patches: { 'src/a.ts': commit.patch },
      isOnBranch: commit.isOnBranch,
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
    patch: '@@ -1,4 +1,4 @@\n-a\n+b\n x\n y\n-sum\n+total',
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'a'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await githubCollections.pullRequests.update((query) => query.where({ number: 5 }), {
    data(record) {
      record.headSha = 'd'.repeat(40);
    },
  });

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'b'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  const connection = await createGitHubConnection({
    appID: 1,
    privateKey: buildStubAppKey(),
    installationID: 7,
  });

  const outcome = await runGitHubCheck(
    connection,
    { owner: 'example', repo: 'app', number: 5 },
    { failedReporters: [] },
  );

  expect(outcome).toMatchObject({ conclusion: 'success', open: [], reviewed: true });
});

test('it passes the check on a late fix that names the rebased copy of the commit a review read', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'b'.repeat(40),
  });

  for (const commit of [
    { sha: 'a'.repeat(40), isOnBranch: false, patch: '@@ -1,1 +1,1 @@\n-a\n+b' },
    { sha: 'b'.repeat(40), isOnBranch: false, patch: '@@ -4,1 +4,1 @@\n-sum\n+total' },
    { sha: 'c'.repeat(40), isOnBranch: true, patch: '@@ -1,1 +1,1 @@\n-a\n+b' },
    { sha: 'd'.repeat(40), isOnBranch: true, patch: '@@ -7,1 +7,1 @@\n-sum\n+total' },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha: commit.sha,
      files: ['src/a.ts'],
      patches: { 'src/a.ts': commit.patch },
      isOnBranch: commit.isOnBranch,
    });
  }

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
    patch: '@@ -1,4 +1,4 @@\n-a\n+b\n x\n y\n-sum\n+total',
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'a'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await githubCollections.pullRequests.update((query) => query.where({ number: 5 }), {
    data(record) {
      record.headSha = 'd'.repeat(40);
    },
  });

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'d'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  const connection = await createGitHubConnection({
    appID: 1,
    privateKey: buildStubAppKey(),
    installationID: 7,
  });

  const outcome = await runGitHubCheck(
    connection,
    { owner: 'example', repo: 'app', number: 5 },
    { failedReporters: [] },
  );

  expect(outcome).toMatchObject({ conclusion: 'success', open: [], reviewed: true });
});

test('it refuses to post under a token, whose comments no later review trusts', async () => {
  const reporter = createGitHubReporter({
    loadConnection: () => createGitHubConnection(null, 'ghp_reader'),
  });

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    baseSha: 'a'.repeat(40),
    headSha: 'b'.repeat(40),
  });

  const result = buildMockReviewResult({
    pullRequest: { owner: 'example', repo: 'app', number: 5 },
    head: 'b'.repeat(40),
  });

  expect(
    reporter.report(result, { logger: getLogger(['test']), options: {}, failedReporters: [] }),
  ).rejects.toThrowWithMessage(
    Error,
    'the github reporter posts as the App: set NOSLOP_GITHUB_APP_ID, NOSLOP_GITHUB_APP_PRIVATE_KEY and NOSLOP_GITHUB_APP_INSTALLATION_ID',
  );
});
