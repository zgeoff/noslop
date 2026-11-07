import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMockFinding, buildMockReviewResult, readTempPrefix } from '@noslop/testing';
import { loadStore } from './load-store';
import { readRecordedFindings } from './read-recorded-findings';
import { writeReview } from './write-review';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), `${readTempPrefix()}noslop-store-`));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const store = await loadStore(join(directory, 'store.sqlite'));

  onTestFinished(() => store.destroy());

  return { store };
}

test('it reads each finding of a pull request once, from its latest review, anchored at that review head', async () => {
  const ctx = await setupTest();

  const located = buildMockFinding({
    id: '2222222222222222',
    secondLocation: {
      repo: 'example/lib',
      commit: 'c'.repeat(40),
      path: 'src/parse.ts',
      startLine: 3,
      endLine: 4,
    },
    rule: 'Reject an empty separator.',
    unverifiedFact: 'The caller trims the value.',
    verdict: 'PLAUSIBLE',
    riskClass: 'parsing',
    fix: 'Return early on an empty separator.',
  });

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      reviewID: 'review-1',
      pullRequest: { owner: 'example', repo: 'app', number: 7 },
      head: 'a'.repeat(40),
      startedAt: '2026-10-17T10:00:00.000Z',
      findings: [
        buildMockFinding({ id: '1111111111111111', title: 'Skip the header row' }),
        located,
      ],
    }),
  );

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      reviewID: 'review-2',
      pullRequest: { owner: 'example', repo: 'app', number: 7 },
      head: 'b'.repeat(40),
      startedAt: '2026-10-17T12:00:00.000Z',
      findings: [buildMockFinding({ id: '1111111111111111', title: 'Skip the header line' })],
    }),
  );

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      reviewID: 'review-other-pr',
      pullRequest: { owner: 'example', repo: 'app', number: 8 },
      findings: [buildMockFinding({ id: '3333333333333333' })],
    }),
  );

  const findings = await readRecordedFindings(ctx.store, 'example/app', 7);

  expect(findings).toStrictEqual([
    buildMockFinding({
      id: '1111111111111111',
      title: 'Skip the header line',
      anchorCommit: 'b'.repeat(40),
    }),
    { ...located, anchorCommit: 'a'.repeat(40) },
  ]);
});
