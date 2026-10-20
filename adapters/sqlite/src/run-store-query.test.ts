import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMockDroppedFinding, buildMockFinding, buildMockReviewResult } from '@noslop/testing';
import { loadStore } from './load-store';
import { runStoreQuery } from './run-store-query';
import { writeDispositions } from './write-dispositions';
import { writeReview } from './write-review';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-store-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const store = await loadStore(join(directory, 'store.sqlite'));

  onTestFinished(() => store.destroy());

  return { store };
}

test('#yield-by-lens gives each lens its fixed and not-a-defect shares', async () => {
  const ctx = await setupTest();

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      findings: [
        buildMockFinding({ id: '1111111111111111' }),
        buildMockFinding({
          id: '2222222222222222',
          anchor: { path: 'src/b.ts', startLine: 2, endLine: 2 },
        }),
        buildMockFinding({
          id: '3333333333333333',
          lens: 'security',
          severity: 'P1',
          criterion: 'security-defect',
        }),
      ],
    }),
  );

  await writeDispositions(ctx.store, 'example/app', 7, [
    {
      findingID: '1111111111111111',
      kind: 'fixed',
      value: '1a2b3c4',
      author: 'dev',
      authorIsOwner: false,
      source: 'github',
      at: '2026-10-17T11:00:00.000Z',
    },
    {
      findingID: '2222222222222222',
      kind: 'not-a-defect',
      value: 'the caller holds the lock',
      author: 'dev',
      authorIsOwner: false,
      source: 'github',
      at: '2026-10-17T11:00:00.000Z',
    },
  ]);

  const rows = await runStoreQuery(ctx.store, 'yield-by-lens');

  expect(rows).toStrictEqual([
    { lens: 'correctness', findings: 2, fixed: 1, notADefect: 1, open: 0, yield: 0.5, noise: 0.5 },
    { lens: 'security', findings: 1, fixed: 0, notADefect: 0, open: 1, yield: 0, noise: 0 },
  ]);
});

test('#yield-by-depth counts each finding at the depth of the first review that reported it', async () => {
  const ctx = await setupTest();

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      reviewID: 'review-light',
      depth: 'light',
      endedAt: '2026-10-17T10:01:00.000Z',
      findings: [buildMockFinding({ id: '1111111111111111', callID: null })],
    }),
  );

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      reviewID: 'review-deep',
      depth: 'deep',
      endedAt: '2026-10-17T12:01:00.000Z',
      calls: [],
      findings: [
        buildMockFinding({ id: '1111111111111111', callID: null }),
        buildMockFinding({
          id: '2222222222222222',
          callID: null,
          anchor: { path: 'src/b.ts', startLine: 2, endLine: 2 },
        }),
      ],
    }),
  );

  await writeDispositions(ctx.store, 'example/app', 7, [
    {
      findingID: '1111111111111111',
      kind: 'fixed',
      value: '1a2b3c4',
      author: 'dev',
      authorIsOwner: false,
      source: 'github',
      at: '2026-10-17T13:00:00.000Z',
    },
    {
      findingID: '2222222222222222',
      kind: 'not-a-defect',
      value: 'the caller holds the lock',
      author: 'dev',
      authorIsOwner: false,
      source: 'github',
      at: '2026-10-17T13:00:00.000Z',
    },
  ]);

  const rows = await runStoreQuery(ctx.store, 'yield-by-depth');

  expect(rows).toStrictEqual([
    { depth: 'deep', findings: 1, fixed: 0, notADefect: 1, open: 0, yield: 0, noise: 1 },
    { depth: 'light', findings: 1, fixed: 1, notADefect: 0, open: 0, yield: 1, noise: 0 },
  ]);
});

test('#open-findings lists the findings of the latest review with no disposition', async () => {
  const ctx = await setupTest();

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      reviewID: 'review-1',
      pullRequest: { owner: 'example', repo: 'app', number: 7 },
      findings: [buildMockFinding({ id: '1111111111111111', title: 'Old finding' })],
    }),
  );

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      reviewID: 'review-2',
      pullRequest: { owner: 'example', repo: 'app', number: 7 },
      endedAt: '2026-10-17T12:00:00.000Z',
      findings: [
        buildMockFinding({ id: '2222222222222222', title: 'Open finding' }),
        buildMockFinding({ id: '3333333333333333', title: 'Fixed finding' }),
      ],
    }),
  );

  await writeDispositions(ctx.store, 'example/app', 7, [
    {
      findingID: '3333333333333333',
      kind: 'fixed',
      value: '1a2b3c4',
      author: 'dev',
      authorIsOwner: false,
      source: 'github',
      at: '2026-10-17T12:30:00.000Z',
    },
  ]);

  const rows = await runStoreQuery(ctx.store, 'open-findings');

  expect(rows).toStrictEqual([
    {
      repo: 'example/app',
      pullRequest: 7,
      head: 'b'.repeat(40),
      id: '2222222222222222',
      lens: 'correctness',
      severity: 'P2',
      verdict: 'CONFIRMED',
      title: 'Open finding',
      path: 'src/a.ts',
      startLine: 1,
    },
  ]);
});

test('#open-findings reopens a fixed finding that a later review reports again', async () => {
  const ctx = await setupTest();

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      reviewID: 'review-1',
      pullRequest: { owner: 'example', repo: 'app', number: 7 },
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
  );

  await writeDispositions(ctx.store, 'example/app', 7, [
    {
      findingID: '1111111111111111',
      kind: 'fixed',
      value: '1a2b3c4',
      author: 'dev',
      authorIsOwner: false,
      source: 'github',
      at: '2026-10-17T11:00:00.000Z',
    },
  ]);

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      reviewID: 'review-2',
      pullRequest: { owner: 'example', repo: 'app', number: 7 },
      endedAt: '2026-10-17T12:01:00.000Z',
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
  );

  const open = await runStoreQuery(ctx.store, 'open-findings');
  const yields = await runStoreQuery(ctx.store, 'yield-by-lens');

  expect(open.map((row) => row['id'])).toStrictEqual(['1111111111111111']);
  expect(yields).toMatchObject([{ lens: 'correctness', fixed: 0, open: 1 }]);
});

test('#yield-by-lens counts one finding ID in 2 repos as 2 findings', async () => {
  const ctx = await setupTest();

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      reviewID: 'review-x',
      repo: 'example/x',
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
  );

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      reviewID: 'review-y',
      repo: 'example/y',
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
  );

  const rows = await runStoreQuery(ctx.store, 'yield-by-lens');

  expect(rows).toMatchObject([{ lens: 'correctness', findings: 2, open: 2 }]);
});

test('#yield-by-lens applies a disposition only to the finding ID of its own repo', async () => {
  const ctx = await setupTest();

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      reviewID: 'review-x',
      repo: 'example/x',
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
  );

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      reviewID: 'review-y',
      repo: 'example/y',
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
  );

  await writeDispositions(ctx.store, 'example/x', 7, [
    {
      findingID: '1111111111111111',
      kind: 'not-a-defect',
      value: 'the caller holds the lock',
      author: 'dev',
      authorIsOwner: false,
      source: 'github',
      at: '2026-10-17T13:00:00.000Z',
    },
  ]);

  const rows = await runStoreQuery(ctx.store, 'yield-by-lens');

  expect(rows).toStrictEqual([
    { lens: 'correctness', findings: 2, fixed: 0, notADefect: 1, open: 1, yield: 0, noise: 0.5 },
  ]);
});

test('#cost-by-depth sums the tokens of the calls at each depth', async () => {
  const ctx = await setupTest();

  await writeReview(ctx.store, buildMockReviewResult());

  const rows = await runStoreQuery(ctx.store, 'cost-by-depth');

  expect(rows).toStrictEqual([
    {
      depth: 'light',
      calls: 1,
      failed: 0,
      inputTokens: 100,
      cachedInputTokens: 400,
      cacheWriteTokens: 20,
      outputTokens: 10,
      meanDurationMs: 1000,
    },
  ]);
});

test('#recall-by-lens counts the escapes whose lens ran on the change and reported there', async () => {
  const ctx = await setupTest();

  await writeReview(
    ctx.store,
    buildMockReviewResult({ findings: [buildMockFinding({ id: '1111111111111111' })] }),
  );

  await ctx.store
    .insertInto('escapes')
    .values([
      {
        escape_id: 'escape-1',
        repo: 'example/app',
        issue: '#12',
        head: 'b'.repeat(40),
        lens: 'correctness',
        defect: 'The total skips the first item',
        path: 'src/a.ts',
        start_line: 1,
        end_line: 1,
        recorded_at: '2026-10-18T00:00:00.000Z',
      },
      {
        escape_id: 'escape-2',
        repo: 'example/app',
        issue: '#13',
        head: 'b'.repeat(40),
        lens: 'security',
        defect: 'The token leaks to the log',
        path: null,
        start_line: null,
        end_line: null,
        recorded_at: '2026-10-18T00:00:00.000Z',
      },
    ])
    .execute();

  const rows = await runStoreQuery(ctx.store, 'recall-by-lens');

  expect(rows).toStrictEqual([
    { lens: 'correctness', escapes: 1, lensRan: 1, lensReported: 1 },
    { lens: 'security', escapes: 1, lensRan: 0, lensReported: 0 },
  ]);
});

test('#recall-by-lens counts a lens that ran in a call of the review as well as a lens the review lists', async () => {
  const ctx = await setupTest();

  await writeReview(
    ctx.store,
    buildMockReviewResult({ reviewID: 'review-listed', head: 'b'.repeat(40), calls: [] }),
  );

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      reviewID: 'review-design',
      head: 'c'.repeat(40),
      calls: [
        {
          id: 'design',
          lenses: ['design'],
          depth: 'light',
          adapter: 'codex',
          model: null,
          effort: 'medium',
          status: 'ok',
          attempts: 1,
          tokens: { input: 100, cachedInput: 400, cacheWrite: 20, output: 10 },
          durationMs: 1000,
        },
      ],
    }),
  );

  await ctx.store
    .insertInto('escapes')
    .values([
      {
        escape_id: 'escape-1',
        repo: 'example/app',
        issue: '#12',
        head: 'b'.repeat(40),
        lens: 'correctness',
        defect: 'The total skips the first item',
        path: null,
        start_line: null,
        end_line: null,
        recorded_at: '2026-10-18T00:00:00.000Z',
      },
      {
        escape_id: 'escape-2',
        repo: 'example/app',
        issue: '#13',
        head: 'c'.repeat(40),
        lens: 'design',
        defect: 'The parser rebuilds a library by hand',
        path: null,
        start_line: null,
        end_line: null,
        recorded_at: '2026-10-18T00:00:00.000Z',
      },
    ])
    .execute();

  const rows = await runStoreQuery(ctx.store, 'recall-by-lens');

  expect(rows).toStrictEqual([
    { lens: 'correctness', escapes: 1, lensRan: 1, lensReported: 0 },
    { lens: 'design', escapes: 1, lensRan: 1, lensReported: 0 },
  ]);
});

test('#recall-by-depth counts a lens that ran in a call of the review as well as a lens the review lists', async () => {
  const ctx = await setupTest();

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      reviewID: 'review-listed',
      head: 'b'.repeat(40),
      depth: 'light',
      calls: [],
    }),
  );

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      reviewID: 'review-design',
      head: 'c'.repeat(40),
      depth: 'standard',
      calls: [
        {
          id: 'design',
          lenses: ['design'],
          depth: 'standard',
          adapter: 'codex',
          model: null,
          effort: 'medium',
          status: 'ok',
          attempts: 1,
          tokens: { input: 100, cachedInput: 400, cacheWrite: 20, output: 10 },
          durationMs: 1000,
        },
      ],
    }),
  );

  await ctx.store
    .insertInto('escapes')
    .values([
      {
        escape_id: 'escape-1',
        repo: 'example/app',
        issue: '#12',
        head: 'b'.repeat(40),
        lens: 'correctness',
        defect: 'The total skips the first item',
        path: null,
        start_line: null,
        end_line: null,
        recorded_at: '2026-10-18T00:00:00.000Z',
      },
      {
        escape_id: 'escape-2',
        repo: 'example/app',
        issue: '#13',
        head: 'c'.repeat(40),
        lens: 'design',
        defect: 'The parser rebuilds a library by hand',
        path: null,
        start_line: null,
        end_line: null,
        recorded_at: '2026-10-18T00:00:00.000Z',
      },
    ])
    .execute();

  const rows = await runStoreQuery(ctx.store, 'recall-by-depth');

  expect(rows).toStrictEqual([
    { depth: 'light', escapes: 1, lensRan: 1, lensReported: 0 },
    { depth: 'standard', escapes: 1, lensRan: 1, lensReported: 0 },
  ]);
});

test('#recall-by-depth counts each escape at the depth of the latest review of its change', async () => {
  const ctx = await setupTest();

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      reviewID: 'review-light',
      depth: 'light',
      endedAt: '2026-10-17T10:01:00.000Z',
    }),
  );

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      reviewID: 'review-standard',
      depth: 'standard',
      endedAt: '2026-10-17T12:01:00.000Z',
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
  );

  await ctx.store
    .insertInto('escapes')
    .values([
      {
        escape_id: 'escape-1',
        repo: 'example/app',
        issue: '#12',
        head: 'b'.repeat(40),
        lens: 'correctness',
        defect: 'The total skips the first item',
        path: 'src/a.ts',
        start_line: 1,
        end_line: 1,
        recorded_at: '2026-10-18T00:00:00.000Z',
      },
      {
        escape_id: 'escape-2',
        repo: 'example/app',
        issue: '#13',
        head: 'c'.repeat(40),
        lens: 'correctness',
        defect: 'The count is off by one',
        path: null,
        start_line: null,
        end_line: null,
        recorded_at: '2026-10-18T00:00:00.000Z',
      },
    ])
    .execute();

  const rows = await runStoreQuery(ctx.store, 'recall-by-depth');

  expect(rows).toStrictEqual([
    { depth: null, escapes: 1, lensRan: 0, lensReported: 0 },
    { depth: 'standard', escapes: 1, lensRan: 1, lensReported: 1 },
  ]);
});

test('#dropped-findings lists each dropped finding with its rule and quote, newest review first', async () => {
  const ctx = await setupTest();

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      reviewID: 'review-old',
      head: 'c'.repeat(40),
      endedAt: '2026-10-17T10:01:00.000Z',
      dropped: [
        buildMockDroppedFinding({
          lens: 'correctness',
          title: 'Guard the empty list',
          anchor: { path: 'src/b.ts', startLine: 9, endLine: 9 },
          criterion: 'wrong-behaviour-edge-path',
          reason: 'anchor-outside-diff',
          rule: null,
          ruleQuote: null,
        }),
      ],
    }),
  );

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      reviewID: 'review-new',
      pullRequest: { owner: 'example', repo: 'app', number: 7 },
      endedAt: '2026-10-17T12:01:00.000Z',
      dropped: [buildMockDroppedFinding()],
    }),
  );

  const rows = await runStoreQuery(ctx.store, 'dropped-findings');

  expect(rows).toStrictEqual([
    {
      repo: 'example/app',
      pullRequest: 7,
      head: 'b'.repeat(40),
      lens: 'naming-shape-and-comments',
      reason: 'unknown-rule',
      title: 'Start the name with a verb',
      path: 'src/a.ts',
      startLine: 1,
      rule: 'RULES.md',
      ruleQuote: 'Every name starts with a verb.',
    },
    {
      repo: 'example/app',
      pullRequest: null,
      head: 'c'.repeat(40),
      lens: 'correctness',
      reason: 'anchor-outside-diff',
      title: 'Guard the empty list',
      path: 'src/b.ts',
      startLine: 9,
      rule: null,
      ruleQuote: null,
    },
  ]);
});

test('#findings-by-pr lists each finding of a pull request once, with its latest disposition', async () => {
  const ctx = await setupTest();

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      reviewID: 'review-1',
      pullRequest: { owner: 'example', repo: 'app', number: 7 },
      head: 'b'.repeat(40),
      endedAt: '2026-10-17T10:01:00.000Z',
      findings: [buildMockFinding({ id: '1111111111111111', title: 'Sum every item' })],
    }),
  );

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      reviewID: 'review-2',
      pullRequest: { owner: 'example', repo: 'app', number: 7 },
      head: 'c'.repeat(40),
      endedAt: '2026-10-17T12:01:00.000Z',
      findings: [
        buildMockFinding({
          id: '1111111111111111',
          title: 'Return the total of every item',
          anchor: { path: 'src/a.ts', startLine: 3, endLine: 3 },
        }),
        buildMockFinding({
          id: '2222222222222222',
          lens: 'naming-shape-and-comments',
          title: 'Start the name with a verb',
          anchor: { path: 'src/b.ts', startLine: 5, endLine: 5 },
          criterion: 'taste-rule',
          rule: 'RULES.md',
        }),
      ],
    }),
  );

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      reviewID: 'review-branch',
      head: 'd'.repeat(40),
      endedAt: '2026-10-17T12:01:00.000Z',
      findings: [buildMockFinding({ id: '3333333333333333' })],
    }),
  );

  await writeDispositions(ctx.store, 'example/app', 7, [
    {
      findingID: '1111111111111111',
      kind: 'not-a-defect',
      value: 'the caller skips the header row',
      author: 'dev',
      authorIsOwner: false,
      source: 'github',
      at: '2026-10-17T11:00:00.000Z',
    },
    {
      findingID: '1111111111111111',
      kind: 'fixed',
      value: '1a2b3c4',
      author: 'dev',
      authorIsOwner: false,
      source: 'github',
      at: '2026-10-17T12:30:00.000Z',
    },
  ]);

  const rows = await runStoreQuery(ctx.store, 'findings-by-pr');

  expect(rows).toStrictEqual([
    {
      repo: 'example/app',
      pullRequest: 7,
      head: 'c'.repeat(40),
      id: '1111111111111111',
      path: 'src/a.ts',
      startLine: 3,
      severity: 'P2',
      lens: 'correctness',
      rule: null,
      title: 'Return the total of every item',
      dispositionKind: 'fixed',
      dispositionValue: '1a2b3c4',
    },
    {
      repo: 'example/app',
      pullRequest: 7,
      head: 'c'.repeat(40),
      id: '2222222222222222',
      path: 'src/b.ts',
      startLine: 5,
      severity: 'P2',
      lens: 'naming-shape-and-comments',
      rule: 'RULES.md',
      title: 'Start the name with a verb',
      dispositionKind: null,
      dispositionValue: null,
    },
  ]);
});

test('#findings-by-pr keeps only the findings of the repo, pull request and time the filters name', async () => {
  const ctx = await setupTest();

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      reviewID: 'review-early',
      pullRequest: { owner: 'example', repo: 'app', number: 7 },
      endedAt: '2026-10-17T10:01:00.000Z',
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
  );

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      reviewID: 'review-late',
      pullRequest: { owner: 'example', repo: 'app', number: 7 },
      endedAt: '2026-10-17T12:01:00.000Z',
      findings: [buildMockFinding({ id: '2222222222222222' })],
    }),
  );

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      reviewID: 'review-other-pr',
      pullRequest: { owner: 'example', repo: 'app', number: 8 },
      endedAt: '2026-10-17T12:01:00.000Z',
      findings: [buildMockFinding({ id: '3333333333333333' })],
    }),
  );

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      reviewID: 'review-other-repo',
      repo: 'example/other',
      pullRequest: { owner: 'example', repo: 'other', number: 7 },
      endedAt: '2026-10-17T12:01:00.000Z',
      findings: [buildMockFinding({ id: '4444444444444444' })],
    }),
  );

  const rows = await runStoreQuery(ctx.store, 'findings-by-pr', {
    repo: 'example/app',
    pullRequest: 7,
    since: '2026-10-17T12:00:00.000Z',
  });

  expect(rows.map((row) => row['id'])).toStrictEqual(['2222222222222222']);
});

test('#findings-by-pr gives a finding only the dispositions of its own pull request', async () => {
  const ctx = await setupTest();

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      reviewID: 'review-7',
      pullRequest: { owner: 'example', repo: 'app', number: 7 },
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
  );

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      reviewID: 'review-8',
      pullRequest: { owner: 'example', repo: 'app', number: 8 },
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
  );

  await writeDispositions(ctx.store, 'example/app', 8, [
    {
      findingID: '1111111111111111',
      kind: 'fixed',
      value: '1a2b3c4',
      author: 'dev',
      authorIsOwner: false,
      source: 'github',
      at: '2026-10-17T11:00:00.000Z',
    },
  ]);

  const rows = await runStoreQuery(ctx.store, 'findings-by-pr');

  expect(rows).toMatchObject([
    { pullRequest: 7, dispositionKind: null, dispositionValue: null },
    { pullRequest: 8, dispositionKind: 'fixed', dispositionValue: '1a2b3c4' },
  ]);
});

test('#findings-by-pr gives a disposition with no pull request to the finding in every pull request of its repo', async () => {
  const ctx = await setupTest();

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      reviewID: 'review-7',
      pullRequest: { owner: 'example', repo: 'app', number: 7 },
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
  );

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      reviewID: 'review-8',
      pullRequest: { owner: 'example', repo: 'app', number: 8 },
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
  );

  await ctx.store
    .insertInto('dispositions')
    .values({
      repo: 'example/app',
      pull_request: null,
      finding_id: '1111111111111111',
      kind: 'not-a-defect',
      value: 'the caller holds the lock',
      author: 'dev',
      author_is_owner: 0,
      source: 'github',
      at: '2026-10-17T11:00:00.000Z',
    })
    .execute();

  const rows = await runStoreQuery(ctx.store, 'findings-by-pr');

  expect(rows).toMatchObject([
    { pullRequest: 7, dispositionKind: 'not-a-defect' },
    { pullRequest: 8, dispositionKind: 'not-a-defect' },
  ]);
});
