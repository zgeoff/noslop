import { expect, test } from 'bun:test';
import { buildMockFinding, buildMockReviewResult } from '@noslop/testing';
import { formatSummaryComment } from './format-summary-comment';

test('it writes the count, risk, table, details and marker of a first review', () => {
  const findings = [
    buildMockFinding({
      id: '2222222222222222',
      title: 'Test the commit',
      lens: 'tests',
      anchor: { path: 'src/db/driver.test.ts', startLine: 30, endLine: 30 },
    }),
    buildMockFinding({
      id: '1111111111111111',
      title: 'Create the table | first',
      anchor: { path: 'README.md', startLine: 35, endLine: 35 },
    }),
  ];

  const result = buildMockReviewResult({
    base: 'b'.repeat(40),
    head: 'a'.repeat(40),
    lenses: ['correctness', 'tests'],
    special: 'sync',
    findings,
  });

  const links = new Map([
    ['1111111111111111', 'https://github.com/example/app/pull/5#discussion_r7'],
  ]);

  expect(
    formatSummaryComment(
      result,
      {
        head: 'a'.repeat(40),
        reviews: 1,
        reported: [],
        failedCalls: 0,
        followUps: [],
        confirmed: [],
      },
      { confirmations: [], posted: 0 },
      links,
    ),
  ).toMatchInlineSnapshot(`
    "### noslop: 2 findings, both P2

    **Risk: medium.**

    | | Finding | File |
    |---|---|---|
    | P2 | [Create the table \\| first](https://github.com/example/app/pull/5#discussion_r7) | \`README.md:35\` |
    | P2 | Test the commit | \`driver.test.ts:30\` |

    <details><summary>Review details</summary>

    Review 1 · \`aaaaaaaaaaaa\` against \`bbbbbbbbbbbb\` · light depth · lenses correctness, tests · special change: sync
    </details>
    <!-- noslop:summary {"head":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","reviews":1,"reported":[],"failedCalls":0,"followUps":[],"confirmed":[]} -->"
  `);
});

test('it writes the severity mix, the failed calls and each fix of a re-review', () => {
  const findings = [
    buildMockFinding({ id: '1111111111111111', severity: 'P3', title: 'Name the retry' }),
    buildMockFinding({ id: '2222222222222222', severity: 'P1', title: 'Lock the row' }),
    buildMockFinding({ id: '3333333333333333', severity: 'P3', title: 'Name the loop' }),
  ];

  const result = buildMockReviewResult({
    findings,
    failedCalls: [{ id: 'B', lenses: ['security'], reason: 'codex timed out' }],
  });

  expect(
    formatSummaryComment(
      result,
      {
        head: 'b'.repeat(40),
        reviews: 2,
        reported: [],
        failedCalls: 1,
        followUps: [],
        confirmed: [],
      },
      {
        confirmations: [
          { id: '4444444444444444', title: 'Await the write', commit: 'abc1234def', fixed: true },
          { id: '5555555555555555', title: 'Close the file', commit: 'def5678', fixed: false },
        ],
        posted: 2,
      },
      new Map(),
    ),
  ).toMatchInlineSnapshot(`
    "### noslop: 3 findings: 1 P1, 2 P3

    **Risk: high.**

    ⚠️ 1 lens call failed, so this review is partial.

    ✅ Await the write: fixed in \`abc1234\`
    ❌ Close the file: not fixed in \`def5678\`

    | | Finding | File |
    |---|---|---|
    | P1 | Lock the row | \`a.ts:1\` |
    | P3 | Name the retry | \`a.ts:1\` |
    | P3 | Name the loop | \`a.ts:1\` |

    <details><summary>Review details</summary>

    Review 2 · \`bbbbbbbbbbbb\` against \`aaaaaaaaaaaa\` · light depth · lenses correctness

    Failed call \`B\` (security): codex timed out
    </details>
    <!-- noslop:summary {"head":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","reviews":2,"reported":[],"failedCalls":1,"followUps":[],"confirmed":[]} -->"
  `);
});

test('it names the first 20 files the review did not read and counts the rest', () => {
  const result = buildMockReviewResult({
    notReviewed: Array.from({ length: 500 }, (_, index) => ({
      path: `samples/${'d'.repeat(300)}/corpus-${index}.jsonl`,
      reason: 'data' as const,
    })),
  });

  const body = formatSummaryComment(
    result,
    {
      head: 'b'.repeat(40),
      reviews: 1,
      reported: [],
      failedCalls: 0,
      followUps: [],
      confirmed: [],
    },
    { confirmations: [], posted: 0 },
    new Map(),
  );

  expect(body.match(/: not reviewed: data file$/gmu)).toHaveLength(20);
  expect(body).toInclude('\n- and 480 more\n');
  expect(body).toInclude(`- \`samples/${'d'.repeat(192)}…\`: not reviewed: data file`);
  expect(body.length).toBeLessThan(10_000);
});

test('it names each file the review did not read beneath the headline', () => {
  const result = buildMockReviewResult({
    notReviewed: [
      { path: 'samples/corpus.jsonl', reason: 'data' },
      { path: 'samples/big.json', reason: 'too-large' },
    ],
  });

  expect(
    formatSummaryComment(
      result,
      {
        head: 'b'.repeat(40),
        reviews: 1,
        reported: [],
        failedCalls: 0,
        followUps: [],
        confirmed: [],
      },
      { confirmations: [], posted: 0 },
      new Map(),
    ),
  ).toMatchInlineSnapshot(`
    "### noslop: no findings

    ⚠️ 2 files left out of the review:
    - \`samples/corpus.jsonl\`: not reviewed: data file
    - \`samples/big.json\`: not reviewed: too large

    <details><summary>Review details</summary>

    Review 1 · \`bbbbbbbbbbbb\` against \`aaaaaaaaaaaa\` · light depth · lenses correctness
    </details>
    <!-- noslop:summary {"head":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","reviews":1,"reported":[],"failedCalls":0,"followUps":[],"confirmed":[]} -->"
  `);
});

test('it heads a re-review with no findings whose every fix is confirmed as all fixed', () => {
  const result = buildMockReviewResult();

  expect(
    formatSummaryComment(
      result,
      {
        head: 'b'.repeat(40),
        reviews: 2,
        reported: [],
        failedCalls: 0,
        followUps: [],
        confirmed: [],
      },
      {
        confirmations: [
          { id: '4444444444444444', title: 'Await the write', commit: 'abc1234', fixed: true },
          { id: '5555555555555555', title: 'Close the file', commit: 'def5678', fixed: true },
        ],
        posted: 2,
      },
      new Map(),
    ),
  ).toStartWith('### noslop: all 2 findings fixed\n\n✅ Await the write: fixed in `abc1234`\n');
});

test('it heads a re-review with no new findings when an earlier finding has no confirmed fix', () => {
  const result = buildMockReviewResult();

  expect(
    formatSummaryComment(
      result,
      {
        head: 'b'.repeat(40),
        reviews: 2,
        reported: [],
        failedCalls: 0,
        followUps: [],
        confirmed: [],
      },
      {
        confirmations: [
          { id: '4444444444444444', title: 'Await the write', commit: 'abc1234', fixed: true },
          { id: '5555555555555555', title: 'Close the file', commit: 'def5678', fixed: true },
        ],
        posted: 3,
      },
      new Map(),
    ),
  ).toStartWith('### noslop: no new findings\n\n✅ Await the write: fixed in `abc1234`\n');
});

test('it heads a review with no findings without a risk line', () => {
  const result = buildMockReviewResult();

  expect(
    formatSummaryComment(
      result,
      {
        head: 'b'.repeat(40),
        reviews: 1,
        reported: [],
        failedCalls: 0,
        followUps: [],
        confirmed: [],
      },
      { confirmations: [], posted: 0 },
      new Map(),
    ),
  ).toStartWith('### noslop: no findings\n\n<details><summary>Review details</summary>\n');
});

test.each([
  ['P3', 'low'],
  ['P2', 'medium'],
  ['P1', 'high'],
] as const)('it gives a lone %s finding %s risk', (severity, risk) => {
  const finding = buildMockFinding({ severity });
  const result = buildMockReviewResult({ findings: [finding] });

  expect(
    formatSummaryComment(
      result,
      {
        head: 'b'.repeat(40),
        reviews: 1,
        reported: [],
        failedCalls: 0,
        followUps: [],
        confirmed: [],
      },
      { confirmations: [], posted: 0 },
      new Map(),
    ),
  ).toInclude(`### noslop: 1 finding, ${severity}\n\n**Risk: ${risk}.**`);
});

test('it gives a P3 finding in a marked risk class high risk', () => {
  const finding = buildMockFinding({ severity: 'P3', riskClass: 'auth' });
  const result = buildMockReviewResult({ findings: [finding] });

  expect(
    formatSummaryComment(
      result,
      {
        head: 'b'.repeat(40),
        reviews: 1,
        reported: [],
        failedCalls: 0,
        followUps: [],
        confirmed: [],
      },
      { confirmations: [], posted: 0 },
      new Map(),
    ),
  ).toInclude('**Risk: high.**');
});
