import { expect, test } from 'bun:test';
import { getLogger } from '@logtape/logtape';
import {
  STUB_APP_LOGIN,
  buildMockFinding,
  buildMockReviewResult,
  buildStubAppKey,
  githubCollections,
} from '@noslop/testing';
import { createGitHubClient } from './create-github-client';
import { createGitHubReporter } from './create-github-reporter';

function setupTest() {
  const privateKey = buildStubAppKey();

  const reporter = createGitHubReporter({
    loadClient: () => createGitHubClient({ appID: 1, privateKey, installationID: 7 }),
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
  expect(summary[0]).toInclude('`1111111111111111` Return the total of every item: fixed');

  expect(githubCollections.checkRuns.all().map((run) => run.conclusion)).toStrictEqual([
    'failure',
    'success',
  ]);
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

test('it files a new finding in code the change did not write as an issue after the re-check', async () => {
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
        pullRequest: { owner: 'example', repo: 'app', number: 5 },
        head: head.repeat(40),
        findings: [],
      }),
      { logger: ctx.logger, options: {}, failedReporters: [] },
    );
  }

  await ctx.reporter.report(
    buildMockReviewResult({
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

  expect(githubCollections.issues.all().map((issue) => issue.title)).toStrictEqual([
    'Close the old file',
  ]);

  expect(githubCollections.reviewComments.all().map((comment) => comment.body)).toSatisfyAll(
    (body: string) => body.includes('Await the new write'),
  );
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
