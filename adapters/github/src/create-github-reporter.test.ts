import { expect, test } from 'bun:test';
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
import { createGitHubConnection } from './create-github-connection';
import { createGitHubReporter } from './create-github-reporter';
import { readPullRequestState } from './read-pull-request-state';

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

  const struck = githubCollections.reviewComments.findFirst((q) =>
    q.where({ id: thread?.id ?? -1 }),
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

  const restored = githubCollections.reviewComments.findFirst((q) =>
    q.where({ id: thread?.id ?? -1 }),
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

  const unanchored = githubCollections.issueComments.findFirst((q) =>
    q.where({ body: (body) => body.includes('<!-- noslop:finding ') }),
  );

  const summary = githubCollections.issueComments.findFirst((q) =>
    q.where({ body: (body) => body.includes('<!-- noslop:summary ') }),
  );

  expect(summary?.body).toInclude(
    `| P2 | [Return the total of every item](https://github.com/example/app/pull/5#discussion_r${inline?.id}) | \`a.ts:1\` |`,
  );

  expect(summary?.body).toInclude(
    `| P2 | [Close the consumer](https://github.com/example/app/pull/5#issuecomment-${unanchored?.id}) | \`consumer.ts:40\` |`,
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

  const roots = githubCollections.reviewComments.findMany((q) => q.where({ inReplyToID: null }));

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

  const answers = githubCollections.reviewComments.findMany((q) =>
    q.where({
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

  const own = githubCollections.issueComments.findMany((q) =>
    q.where({ authorLogin: STUB_APP_LOGIN }),
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

  expect(summary[0]).toInclude('✅ Return the total of every item: fixed in');
  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('success');
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

  githubCollections.pullCommits.delete((q) => q.where({ sha: 'abc1234'.padEnd(40, 'd') }));

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

  const answers = githubCollections.issueComments.findMany((q) =>
    q.where({ body: (body) => body.startsWith('That reply is not a disposition.') }),
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
