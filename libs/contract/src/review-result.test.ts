import { expect, test } from 'bun:test';
import type { ReviewResult } from './review-result';
import { reviewResultSchema } from './review-result';

test('it accepts a review result with one call and no findings', () => {
  const payload: ReviewResult = {
    version: 3,
    reviewID: 'r_1',
    repo: 'example/app',
    pullRequest: { owner: 'example', repo: 'app', number: 7 },
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
    title: 'feat: add the queue',
    depth: 'standard',
    steppedUpFrom: null,
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
    failedCalls: [],
    configHash: 'c0ffee',
    startedAt: '2026-10-17T10:00:00.000Z',
    endedAt: '2026-10-17T10:01:00.000Z',
  };

  expect(reviewResultSchema.safeParse(payload).data).toStrictEqual(payload);
});

test('it rejects a head that is not a full commit', () => {
  const result = reviewResultSchema.safeParse({
    version: 3,
    reviewID: 'r_1',
    repo: 'example/app',
    pullRequest: null,
    base: 'a'.repeat(40),
    head: 'main',
    title: null,
    depth: 'standard',
    steppedUpFrom: null,
    special: null,
    riskClasses: [],
    lenses: ['correctness'],
    calls: [],
    findings: [],
    failedCalls: [],
    configHash: 'c0ffee',
    startedAt: '2026-10-17T10:00:00.000Z',
    endedAt: '2026-10-17T10:01:00.000Z',
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['head'] });
});

test('it rejects an output version it does not know', () => {
  const result = reviewResultSchema.safeParse({
    version: 2,
    reviewID: 'r_1',
    repo: 'example/app',
    pullRequest: null,
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
    title: null,
    depth: 'standard',
    steppedUpFrom: null,
    special: null,
    riskClasses: [],
    lenses: ['correctness'],
    calls: [],
    findings: [],
    failedCalls: [],
    configHash: 'c0ffee',
    startedAt: '2026-10-17T10:00:00.000Z',
    endedAt: '2026-10-17T10:01:00.000Z',
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['version'] });
});
