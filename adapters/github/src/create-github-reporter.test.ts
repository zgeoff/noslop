import { expect, mock, test } from 'bun:test';
import { getLogger } from '@logtape/logtape';
import {
  GITHUB_API_URL,
  STUB_APP_LOGIN,
  buildMockFinding,
  buildMockReviewResult,
  buildStubAppKey,
  githubCollections,
  githubServer,
} from '@noslop/testing';
import { HttpResponse, http } from 'msw';
import { buildNetChangeKey } from './build-net-change-key';
import { createGitHubConnection } from './create-github-connection';
import { createGitHubReporter } from './create-github-reporter';
import { readPullRequestState } from './read-pull-request-state';
import { runGitHubCheck } from './run-github-check';

function setupTest() {
  const privateKey = buildStubAppKey();
  const sleep = mock((delayMs: number) => Promise.resolve(delayMs));

  const reporter = createGitHubReporter({
    loadConnection: () =>
      createGitHubConnection({ appID: 1, privateKey, installationID: 7 }, null, sleep),
  });

  return { reporter, sleep, logger: getLogger(['test']) };
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

test("it confirms a fixed finding on the re-review through its fix call's verdict and passes the check", async () => {
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
      fixChecks: [
        { findingID: '1111111111111111', fixed: true, reason: 'The total counts every item.' },
      ],
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

test('it confirms no fixed finding that the re-review no longer reports when no fix call judged it', async () => {
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

  expect(state.summary?.marker.confirmed).toStrictEqual([]);

  expect(githubCollections.checkRuns.all().at(-1)).toMatchObject({
    conclusion: 'failure',
    summary: expect.toInclude('no re-review has read the commit ccccccc yet'),
  });
});

test('it keeps a confirmed fix through a later review that neither judges nor reports it', async () => {
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
      reviewID: 'review-2',
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
      fixChecks: [
        { findingID: '1111111111111111', fixed: true, reason: 'The total counts every item.' },
      ],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      reviewID: 'review-3',
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'c'.repeat(40),
      head: 'd'.repeat(40),
      findings: [],
      fixChecks: [],
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

  expect(state.summary?.marker.confirmed).toStrictEqual(['1111111111111111:ccccccc']);
  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('success');
});

test('it writes no kept ranges to the summary marker and reads a marker that holds them', async () => {
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
    body: `<!-- noslop:summary {"head":"${'b'.repeat(40)}","base":"${'a'.repeat(40)}","earlier":[{"base":"${'a'.repeat(40)}","head":"${'b'.repeat(40)}","reported":[],"notReviewed":[]}],"notReviewed":[],"reviews":1,"reported":[],"failedCalls":0,"reviewIDs":["review-1"]} -->`,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      reviewID: 'review-2',
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
      notReviewed: [{ path: 'bun.lock', reason: 'too-large' }],
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

  if (state.summary === null) {
    throw new Error('the post wrote no summary');
  }

  expect(state.summary.marker.reviews).toBe(2);
  expect(state.summary.marker.lensHead).toBe('c'.repeat(40));

  expect(state.summary.marker).not.toContainAnyKeys([
    'base',
    'earlier',
    'notReviewed',
    'notReviewedByLens',
  ]);
});

test("it strikes the comment of a fix call's confirmed fix and keeps its marker for the check", async () => {
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
      fixChecks: [
        { findingID: '1111111111111111', fixed: true, reason: 'The total counts every item.' },
      ],
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
      fixChecks: [
        { findingID: '1111111111111111', fixed: true, reason: 'The total counts every item.' },
      ],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const struck = githubCollections.reviewComments.findFirst((query) =>
    query.where({ id: thread?.id ?? -1 }),
  )?.body;

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

  expect(struck).toStartWith('~~**P2 · Correctness** · Return the total of every item~~');
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
    ...Array.from({ length: 4 }, () =>
      http.post(
        `${GITHUB_API_URL}/repos/:owner/:repo/issues/:number/comments`,
        () => new HttpResponse(null, { status: 500 }),
        { once: true },
      ),
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

  expect(failed).toMatchObject({
    status: 'rejected',
    reason: { message: 'GitHub answered the summary comment with 500 on all 4 attempts' },
  });

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
    ...Array.from({ length: 4 }, () =>
      http.post(
        `${GITHUB_API_URL}/repos/:owner/:repo/issues/:number/comments`,
        () => new HttpResponse(null, { status: 500 }),
        { once: true },
      ),
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

  expect(failed).toMatchObject({
    message: 'GitHub answered the summary comment with 500 on all 4 attempts',
  });

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
    ...Array.from({ length: 4 }, () =>
      http.patch(
        `${GITHUB_API_URL}/repos/:owner/:repo/issues/comments/:commentID`,
        () => new HttpResponse(null, { status: 500 }),
        { once: true },
      ),
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

  expect(failed).toMatchObject({
    message: 'GitHub answered the summary comment with 500 on all 4 attempts',
  });

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

test('it shows a fix that a fixes-only run left unjudged as not judged, never as not fixed, says why, and reports no finding again', async () => {
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
      fixesOnly: true,
      fixChecks: [],
      unjudgedFixes: [
        {
          findingID: '1111111111111111',
          reason: 'its code or diff passes the file limit, so no call read it whole',
        },
      ],
      notReviewed: [{ path: 'src/a.ts', reason: 'too-large' }],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments
    .all()
    .findLast((comment) => comment.body.includes('<!-- noslop:summary'));

  expect(summary?.body).toInclude(
    ': not judged in `ccccccc` (its code or diff passes the file limit, so no call read it whole)',
  );

  expect(summary?.body).not.toInclude('❌');
  expect(summary?.body).toInclude('"reported":[]');
});

test('it gives a fix whose call failed no file-limit reason when another call left its small file out as too large', async () => {
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
    body: 'fixed',
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
      fixesOnly: true,
      fixChecks: [],
      failedCalls: [
        { id: 'fix-1111111111111111', lenses: ['correctness'], reason: 'the model timed out' },
      ],
      unjudgedFixes: [{ findingID: '1111111111111111', reason: 'its fix call failed' }],
      notReviewed: [{ path: 'src/a.ts', reason: 'too-large' }],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments
    .all()
    .findLast((comment) => comment.body.includes('<!-- noslop:summary'));

  expect(summary?.body).toInclude(': not judged at the head (its fix call failed)');
  expect(summary?.body).not.toInclude('file limit');
  expect(summary?.body).not.toInclude('❌');
});

test('it keeps the head and key of the summary before a fixes-only run that judged no fix, so the check names the change no call read', async () => {
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
    blobSha: '1'.repeat(40),
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/b.ts',
    status: 'added',
    lines: [1],
    blobSha: '2'.repeat(40),
  });

  const key = buildNetChangeKey({
    head: 'b'.repeat(40),
    isWhole: true,
    files: [{ filename: 'src/a.ts', status: 'modified', sha: '1'.repeat(40) }],
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${'b'.repeat(40)}","key":${JSON.stringify(key)},"reviews":2,"reported":[],"failedCalls":0,"reviewIDs":["review-a","review-b"]} -->`,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      reviewID: 'review-c',
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'a'.repeat(40),
      head: 'c'.repeat(40),
      lenses: [],
      findings: [],
      fixesOnly: true,
      fixChecks: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments
    .all()
    .findLast((comment) => comment.body.includes('<!-- noslop:summary'));

  expect(summary?.body).toInclude(`<!-- noslop:summary {"head":"${'b'.repeat(40)}",`);
  expect(summary?.body).toInclude(`"key":${JSON.stringify(key)}} -->`);

  expect(githubCollections.checkRuns.all().at(-1)).toMatchObject({
    conclusion: 'failure',
    title: `No noslop review of this change to src/b.ts: the patch changed since the review of ${'b'.repeat(12)}.`,
  });
});

test('it keeps the failed calls of a lens review through a fixes-only run that judged a fix with no clean lens review before it', async () => {
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

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
      failedCalls: [{ id: 'security', lenses: ['security'], reason: 'codex timed out' }],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: 'fixed',
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'a'.repeat(40),
      head: 'c'.repeat(40),
      lenses: [],
      findings: [],
      fixesOnly: true,
      fixChecks: [
        { findingID: '1111111111111111', fixed: true, reason: 'The total adds every item now.' },
      ],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments
    .all()
    .findLast((comment) => comment.body.includes('<!-- noslop:summary'));

  expect(summary?.body).toInclude(`<!-- noslop:summary {"head":"${'b'.repeat(40)}",`);
  expect(summary?.body).toInclude('"failedCalls":1,');
  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('failure');
});

test('it drops the failed fix call of an earlier fixes-only run when a later one judges no fix after a clean lens review', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'b'.repeat(40),
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      reviewID: 'review-a',
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      reviewID: 'review-b',
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      lenses: [],
      findings: [],
      fixesOnly: true,
      fixChecks: [],
      failedCalls: [
        { id: 'fix-1111111111111111', lenses: ['correctness'], reason: 'the model timed out' },
      ],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      reviewID: 'review-c',
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      lenses: [],
      findings: [],
      fixesOnly: true,
      fixChecks: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments
    .all()
    .findLast((comment) => comment.body.includes('<!-- noslop:summary'));

  expect(summary?.body).toInclude('"failedCalls":0,');
  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('success');
});

test('it updates the one summary of a fixes-only run before any lens review on a later fixes-only run', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  for (const reviewID of ['review-a', 'review-b']) {
    await ctx.reporter.report(
      buildMockReviewResult({
        reviewID,
        pullRequest: { owner: 'example', repo: 'app', number: 5 },
        base: 'a'.repeat(40),
        head: 'c'.repeat(40),
        lenses: [],
        findings: [],
        fixesOnly: true,
        fixChecks: [],
      }),
      { logger: ctx.logger, options: {}, failedReporters: [] },
    );
  }

  const summaries = githubCollections.issueComments
    .all()
    .filter((comment) => comment.body.includes('<!-- noslop:summary'));

  expect(summaries).toHaveLength(1);
  expect(summaries[0]?.body).toInclude('"reviews":0,"reviewIDs":["review-a","review-b"]');
});

test('it vouches for the merge base alone after a fixes-only run that judged no fix on a pull request no review covered', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'a'.repeat(40),
      head: 'c'.repeat(40),
      lenses: [],
      findings: [],
      fixesOnly: true,
      fixChecks: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summary = githubCollections.issueComments
    .all()
    .findLast((comment) => comment.body.includes('<!-- noslop:summary'));

  expect(summary?.body).toInclude(`<!-- noslop:summary {"head":"${'a'.repeat(40)}","checked":[]`);

  expect(githubCollections.checkRuns.all().at(-1)).toMatchObject({
    conclusion: 'failure',
    title: `No noslop review for this commit, ${'c'.repeat(12)}.`,
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
    fixesOnly: true,
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
    fixesOnly: true,
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
    body: `<!-- noslop:summary {"head":"${'c'.repeat(40)}","base":"${'a'.repeat(40)}","reviews":2,"reported":[],"failedCalls":0,"reviewIDs":["review-a","review-b"]} -->`,
  });

  const result = buildMockReviewResult({
    reviewID: 'review-c',
    pullRequest: { owner: 'example', repo: 'app', number: 5 },
    base: 'b'.repeat(40),
    head: 'c'.repeat(40),
    lenses: [],
    fixesOnly: true,
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
    body: `<!-- noslop:summary {"head":"${'c'.repeat(40)}","base":"${'a'.repeat(40)}","reviews":2,"reported":[],"failedCalls":0,"reviewIDs":["review-a","review-b"]} -->`,
  });

  const result = buildMockReviewResult({
    reviewID: 'review-c',
    pullRequest: { owner: 'example', repo: 'app', number: 5 },
    base: 'b'.repeat(40),
    head: 'c'.repeat(40),
    lenses: [],
    fixesOnly: true,
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
    body: `<!-- noslop:summary {"head":"${'c'.repeat(40)}","base":"${'a'.repeat(40)}","reviews":2,"reported":[],"failedCalls":0,"rejectedMerges":["${'e'.repeat(40)}"],"reviewIDs":["review-a","review-b"]} -->`,
  });

  const result = buildMockReviewResult({
    reviewID: 'review-c',
    pullRequest: { owner: 'example', repo: 'app', number: 5 },
    base: 'a'.repeat(40),
    head: 'c'.repeat(40),
    lenses: [],
    fixesOnly: true,
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
    fixesOnly: true,
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

test('it writes the net-change key of a lens review with no failed call as the lens review key', async () => {
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
    patch: '@@ -1 +1 @@\n-export const a = 0;\n+export const a = 2;',
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'c'.repeat(40),
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

  expect(state.summary?.marker.lensKey).toStrictEqual(
    buildNetChangeKey({
      head: 'c'.repeat(40),
      isWhole: true,
      files: [
        {
          filename: 'src/a.ts',
          status: 'modified',
          sha: null,
          patch: '@@ -1 +1 @@\n-export const a = 0;\n+export const a = 2;',
        },
      ],
    }),
  );
});

test('it keeps the key of the last lens review and drops its head when a later lens review has a failed call', async () => {
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
    body: `<!-- noslop:summary {"head":"${'b'.repeat(40)}","key":{"files":{"src/a.ts":"1111111111111111"}},"lensHead":"${'b'.repeat(40)}","lensKey":{"files":{"src/a.ts":"1111111111111111"}},"reviews":1,"reported":[],"failedCalls":0,"reviewIDs":["review-1"]} -->`,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      reviewID: 'review-2',
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'a'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
      failedCalls: [{ id: 'light', lenses: ['correctness'], reason: 'the model CLI timed out' }],
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

  expect(state.summary?.marker.lensHead).toBeUndefined();

  expect(state.summary?.marker.lensKey).toStrictEqual({
    files: { 'src/a.ts': '1111111111111111' },
  });
});

test('it keeps the key of the last lens review when a fixes-only run moves the key to its own head', async () => {
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
    patch: '@@ -1 +1 @@\n-export const a = 0;\n+export const a = 2;',
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${'b'.repeat(40)}","key":{"files":{"src/a.ts":"1111111111111111"}},"lensHead":"${'b'.repeat(40)}","lensKey":{"files":{"src/a.ts":"1111111111111111"}},"reviews":1,"reported":[],"failedCalls":0,"reviewIDs":["review-1"]} -->`,
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      reviewID: 'review-2',
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      lenses: [],
      findings: [],
      fixesOnly: true,
      fixChecks: [{ findingID: '2222222222222222', fixed: true, reason: 'The guard is in place.' }],
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

  expect(state.summary?.marker).toMatchObject({
    head: 'c'.repeat(40),
    lensHead: 'b'.repeat(40),
    lensKey: { files: { 'src/a.ts': '1111111111111111' } },
  });

  expect(state.summary?.marker.key).not.toStrictEqual({
    files: { 'src/a.ts': '1111111111111111' },
  });
});

test('it posts the summary and the check run when GitHub answers the first summary post with 500', async () => {
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
      () => new HttpResponse(JSON.stringify({ message: 'Server Error' }), { status: 500 }),
      { once: true },
    ),
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summaries = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summaries).toHaveLength(1);
  expect(summaries[0]).toStartWith('### noslop');

  expect(githubCollections.checkRuns.all()).toMatchObject([
    { name: 'noslop', headSha: 'b'.repeat(40), conclusion: 'success' },
  ]);
});

test('it fails the post and names the summary comment when GitHub answers 500 on 4 attempts 1, 2 and 4 seconds apart', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'b'.repeat(40),
  });

  const answer = mock(
    () => new HttpResponse(JSON.stringify({ message: 'Server Error' }), { status: 500 }),
  );

  githubServer.use(
    http.post(`${GITHUB_API_URL}/repos/:owner/:repo/issues/:number/comments`, answer),
  );

  const failed = await ctx.reporter
    .report(
      buildMockReviewResult({
        pullRequest: { owner: 'example', repo: 'app', number: 5 },
        head: 'b'.repeat(40),
        findings: [],
      }),
      { logger: ctx.logger, options: {}, failedReporters: [] },
    )
    .then(
      () => null,
      (error: unknown) => error,
    );

  expect(failed).toMatchObject({
    message: 'GitHub answered the summary comment with 500 on all 4 attempts',
    cause: { status: 500 },
  });

  expect(answer).toHaveBeenCalledTimes(4);
  expect(ctx.sleep.mock.calls).toStrictEqual([[1000], [2000], [4000]]);
  expect(githubCollections.issueComments.all()).toStrictEqual([]);
  expect(githubCollections.checkRuns.all()).toStrictEqual([]);
});

test('it sends the summary again after the retry-after wait when GitHub answers a secondary limit', async () => {
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
      () =>
        HttpResponse.json(
          { message: 'You have exceeded a secondary rate limit' },
          { status: 403, headers: { 'retry-after': '90' } },
        ),
      { once: true },
    ),
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summaries = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(ctx.sleep.mock.calls).toStrictEqual([[90_000]]);
  expect(summaries).toSatisfyAll((body: string) => body.startsWith('### noslop'));
  expect(summaries).toHaveLength(1);
  expect(githubCollections.checkRuns.all()).toMatchObject([{ conclusion: 'success' }]);
});

test('it sends a summary post that GitHub refuses with a permission 403 once, with no retry', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'b'.repeat(40),
  });

  const refuse = mock(() =>
    HttpResponse.json({ message: 'Resource not accessible by integration' }, { status: 403 }),
  );

  githubServer.use(
    http.post(`${GITHUB_API_URL}/repos/:owner/:repo/issues/:number/comments`, refuse),
  );

  const failed = await ctx.reporter
    .report(
      buildMockReviewResult({
        pullRequest: { owner: 'example', repo: 'app', number: 5 },
        head: 'b'.repeat(40),
        findings: [],
      }),
      { logger: ctx.logger, options: {}, failedReporters: [] },
    )
    .then(
      () => null,
      (error: unknown) => error,
    );

  expect(failed).toMatchObject({ status: 403 });
  expect(refuse).toHaveBeenCalledOnce();
  expect(ctx.sleep).not.toHaveBeenCalled();
});

test('it edits the summary when GitHub answers the first edit of a later review with 500', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      reviewID: 'review-b',
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  githubServer.use(
    http.patch(
      `${GITHUB_API_URL}/repos/:owner/:repo/issues/comments/:commentID`,
      () => new HttpResponse(null, { status: 502 }),
      { once: true },
    ),
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      reviewID: 'review-c',
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'c'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const summaries = githubCollections.issueComments.all().map((comment) => comment.body);

  expect(summaries).toHaveLength(1);
  expect(summaries[0]).toInclude('"reviewIDs":["review-b","review-c"]');
  expect(githubCollections.checkRuns.all()).toHaveLength(2);
});

test('it sets the check run when GitHub answers the first check run post with 500', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'b'.repeat(40),
  });

  githubServer.use(
    http.post(
      `${GITHUB_API_URL}/repos/:owner/:repo/check-runs`,
      () => new HttpResponse(null, { status: 500 }),
      { once: true },
    ),
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  expect(githubCollections.checkRuns.all()).toMatchObject([
    { name: 'noslop', headSha: 'b'.repeat(40), conclusion: 'success' },
  ]);

  expect(ctx.sleep.mock.calls).toStrictEqual([[1000]]);
});

test('it fails the post and names the check run when GitHub answers 500 on every attempt', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'b'.repeat(40),
  });

  githubServer.use(
    http.post(
      `${GITHUB_API_URL}/repos/:owner/:repo/check-runs`,
      () => new HttpResponse(null, { status: 500 }),
    ),
  );

  const result = buildMockReviewResult({
    pullRequest: { owner: 'example', repo: 'app', number: 5 },
    head: 'b'.repeat(40),
    findings: [],
  });

  expect(
    ctx.reporter.report(result, { logger: ctx.logger, options: {}, failedReporters: [] }),
  ).rejects.toThrowWithMessage(
    Error,
    'GitHub answered the noslop check run with 500 on all 4 attempts',
  );
});

test("it strikes a fixed finding's comment when GitHub answers the first edit with 500", async () => {
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

  githubServer.use(
    http.patch(
      `${GITHUB_API_URL}/repos/:owner/:repo/pulls/comments/:commentID`,
      () => new HttpResponse(null, { status: 503 }),
      { once: true },
    ),
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
      fixChecks: [
        { findingID: '1111111111111111', fixed: true, reason: 'The total counts every item.' },
      ],
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const struck = githubCollections.reviewComments.findFirst((query) =>
    query.where({ id: thread?.id ?? -1 }),
  );

  expect(struck?.body).toStartWith('~~**P2 · Correctness** · Return the total of every item~~');
});

test('it posts 150 findings of one class as one comment and posts the check through secondary limits', async () => {
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

  await Promise.all(
    Array.from({ length: 50 }, (_, index) =>
      githubCollections.pullFiles.create({
        owner: 'example',
        repo: 'app',
        number: 5,
        path: `scripts/tool-${index}.sh`,
        lines: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      }),
    ),
  );

  const findings = Array.from({ length: 150 }, (_, index) =>
    buildMockFinding({
      id: (index + 1).toString(16).padStart(16, '0'),
      lens: 'static',
      callID: null,
      criterion: 'intent-mismatch',
      title: `Format-only edit to tool-${Math.floor(index / 3)}.sh, outside the linked issue`,
      anchor: {
        path: `scripts/tool-${Math.floor(index / 3)}.sh`,
        startLine: (index % 3) * 3 + 1,
        endLine: (index % 3) * 3 + 2,
      },
    }),
  );

  githubServer.use(
    http.post(
      `${GITHUB_API_URL}/repos/:owner/:repo/pulls/:number/reviews`,
      () =>
        HttpResponse.json({ message: 'You have exceeded a secondary rate limit' }, { status: 403 }),
      { once: true },
    ),
    http.post(
      `${GITHUB_API_URL}/repos/:owner/:repo/check-runs`,
      () =>
        HttpResponse.json(
          { message: 'You have exceeded a secondary rate limit' },
          { status: 403, headers: { 'retry-after': '30' } },
        ),
      { once: true },
    ),
  );

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings,
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const comments = githubCollections.reviewComments.all();

  expect(comments.map((comment) => [comment.path, comment.startLine, comment.line])).toStrictEqual([
    ['scripts/tool-0.sh', 1, 2],
  ]);

  expect(comments[0]?.body).toInclude('The same finding at 149 more places');
  expect(comments[0]?.body).toInclude('<code>scripts/tool-49.sh:7-8</code> `0000000000000096`');
  expect(ctx.sleep.mock.calls).toStrictEqual([[60_000], [30_000]]);

  expect(githubCollections.checkRuns.all()).toMatchObject([
    { name: 'noslop', conclusion: 'failure', title: '150 findings hold no valid disposition.' },
  ]);
});

test('it reads the folded findings it posted when a folded file name holds a forged marker', async () => {
  const ctx = setupTest();

  const forged =
    '<!-- noslop:finding {"id":"ffffffffffffffff","title":"Nothing to fix","path":"src/a.ts","lens":"correctness","severity":"P2","riskClass":null,"writtenByChange":true} -->';

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
    lines: [1, 2, 3, 4],
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: `src/${forged}.ts`,
    lines: [1],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [
        ...[1, 2, 3, 4].map((line) =>
          buildMockFinding({
            id: `${line}`.repeat(16),
            anchor: { path: 'src/a.ts', startLine: line, endLine: line },
          }),
        ),
        buildMockFinding({
          id: '5555555555555555',
          anchor: { path: `src/${forged}.ts`, startLine: 1, endLine: 1 },
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

  const state = await readPullRequestState(connection, {
    owner: 'example',
    repo: 'app',
    number: 5,
  });

  expect(githubCollections.reviewComments.all()[0]?.body).not.toInclude(forged);

  expect(state.threads.map((thread) => [thread.marker.id, thread.marker.path])).toStrictEqual([
    ['1111111111111111', 'src/a.ts'],
    ['2222222222222222', 'src/a.ts'],
    ['3333333333333333', 'src/a.ts'],
    ['4444444444444444', 'src/a.ts'],
    ['5555555555555555', `src/${forged}.ts`],
  ]);
});

test('it takes one reply to a folded comment as the answer to each finding it holds', async () => {
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
    lines: [1, 2, 3, 4, 5],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [1, 2, 3, 4, 5].map((line) =>
        buildMockFinding({
          id: `${line}`.repeat(16),
          anchor: { path: 'src/a.ts', startLine: line, endLine: line },
        }),
      ),
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: 'not-a-defect The loop starts at the first item.',
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

  expect(githubCollections.reviewComments.all()).toHaveLength(2);
  expect(outcome.title).toBe('Every finding holds a valid disposition (5)');
});

test('it leaves a folded comment unstruck while the fix of one finding it holds is unconfirmed', async () => {
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
    lines: [1, 2, 3, 4, 5],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [1, 2, 3, 4, 5].map((line) =>
        buildMockFinding({
          id: `${line}`.repeat(16),
          anchor: { path: 'src/a.ts', startLine: line, endLine: line },
        }),
      ),
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
      fixChecks: [1, 2, 3, 4].map((line) => ({
        findingID: `${line}`.repeat(16),
        fixed: true,
        reason: 'The total counts every item.',
      })),
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const partly = githubCollections.reviewComments.findFirst((query) =>
    query.where({ id: thread?.id ?? -1 }),
  );

  expect(partly?.body).toStartWith('**P2 · Correctness** · Return the total of every item');
});

test('it strikes a folded comment once the fix of each finding it holds is confirmed', async () => {
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
    lines: [1, 2, 3, 4, 5],
  });

  await ctx.reporter.report(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [1, 2, 3, 4, 5].map((line) =>
        buildMockFinding({
          id: `${line}`.repeat(16),
          anchor: { path: 'src/a.ts', startLine: line, endLine: line },
        }),
      ),
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
      fixChecks: [1, 2, 3, 4, 5].map((line) => ({
        findingID: `${line}`.repeat(16),
        fixed: true,
        reason: 'The total counts every item.',
      })),
    }),
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const struck = githubCollections.reviewComments.findFirst((query) =>
    query.where({ id: thread?.id ?? -1 }),
  );

  expect(struck?.body).toStartWith('~~**P2 · Correctness** · Return the total of every item~~');
});
