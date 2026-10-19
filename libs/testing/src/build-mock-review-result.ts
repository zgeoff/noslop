import type { ReviewResult } from '@noslop/contract';
import { REVIEW_OUTPUT_VERSION } from '@noslop/contract';

// a Light review of one commit with one call and no findings
export function buildMockReviewResult(overrides: Partial<ReviewResult> = {}): ReviewResult {
  return {
    version: REVIEW_OUTPUT_VERSION,
    reviewID: 'review-1',
    repo: 'example/app',
    pullRequest: null,
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
    title: 'Change the app',
    depth: 'light',
    special: null,
    riskClasses: [],
    lenses: ['correctness'],
    calls: [
      {
        id: 'light',
        lenses: ['correctness'],
        depth: 'light',
        adapter: 'codex',
        model: null,
        effort: 'low',
        status: 'ok',
        attempts: 1,
        tokens: { input: 100, cachedInput: 400, cacheWrite: 20, output: 10 },
        durationMs: 1000,
      },
    ],
    findings: [],
    dropped: [],
    failedCalls: [],
    notReviewed: [],
    notReviewedByLens: [],
    configHash: 'config-hash',
    startedAt: '2026-10-17T10:00:00.000Z',
    endedAt: '2026-10-17T10:01:00.000Z',
    ...overrides,
  };
}
