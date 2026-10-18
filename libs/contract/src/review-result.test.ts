import { expect, test } from 'bun:test';
import type { ReviewResult } from './review-result';
import { reviewResultSchema } from './review-result';

test('it accepts a review result with one call and one dropped finding', () => {
  const payload: ReviewResult = {
    version: 6,
    reviewID: 'r_1',
    repo: 'example/app',
    pullRequest: { owner: 'example', repo: 'app', number: 7 },
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
    title: 'feat: add the queue',
    depth: 'standard',
    special: null,
    riskClasses: [],
    lenses: ['correctness'],
    calls: [
      {
        id: 'A',
        lenses: ['correctness'],
        depth: 'standard',
        adapter: 'codex',
        model: null,
        effort: 'medium',
        status: 'ok',
        attempts: 1,
        tokens: { input: 1200, cachedInput: 8000, cacheWrite: 400, output: 300 },
        durationMs: 4100,
      },
    ],
    findings: [],
    dropped: [
      {
        lens: 'naming-shape-and-comments',
        callID: 'A',
        title: 'Start the name with a verb',
        anchor: { path: 'src/queue.ts', startLine: 3, endLine: 3 },
        criterion: 'taste-rule',
        reason: 'unknown-rule',
        rule: 'RULES.md',
        ruleQuote: 'Every name starts with a verb.',
      },
    ],
    failedCalls: [],
    notReviewed: [{ path: 'samples/corpus.jsonl', reason: 'data' }],
    configHash: 'c0ffee',
    startedAt: '2026-10-17T10:00:00.000Z',
    endedAt: '2026-10-17T10:01:00.000Z',
  };

  expect(reviewResultSchema.safeParse(payload).data).toStrictEqual(payload);
});

test('it rejects a not-reviewed file with a reason it does not know', () => {
  const result = reviewResultSchema.safeParse({
    version: 6,
    reviewID: 'r_1',
    repo: 'example/app',
    pullRequest: null,
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
    title: null,
    depth: 'standard',
    special: null,
    riskClasses: [],
    lenses: ['correctness'],
    calls: [],
    findings: [],
    dropped: [],
    failedCalls: [],
    notReviewed: [{ path: 'samples/corpus.jsonl', reason: 'skipped' }],
    configHash: 'c0ffee',
    startedAt: '2026-10-17T10:00:00.000Z',
    endedAt: '2026-10-17T10:01:00.000Z',
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['notReviewed', 0, 'reason'] });
});

test('it rejects a head that is not a full commit', () => {
  const result = reviewResultSchema.safeParse({
    version: 6,
    reviewID: 'r_1',
    repo: 'example/app',
    pullRequest: null,
    base: 'a'.repeat(40),
    head: 'main',
    title: null,
    depth: 'standard',
    special: null,
    riskClasses: [],
    lenses: ['correctness'],
    calls: [],
    findings: [],
    dropped: [],
    failedCalls: [],
    notReviewed: [],
    configHash: 'c0ffee',
    startedAt: '2026-10-17T10:00:00.000Z',
    endedAt: '2026-10-17T10:01:00.000Z',
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['head'] });
});

test('it rejects an output version it does not know', () => {
  const result = reviewResultSchema.safeParse({
    version: 5,
    reviewID: 'r_1',
    repo: 'example/app',
    pullRequest: null,
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
    title: null,
    depth: 'standard',
    special: null,
    riskClasses: [],
    lenses: ['correctness'],
    calls: [],
    findings: [],
    dropped: [],
    failedCalls: [],
    notReviewed: [],
    configHash: 'c0ffee',
    startedAt: '2026-10-17T10:00:00.000Z',
    endedAt: '2026-10-17T10:01:00.000Z',
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['version'] });
});
