import { expect, test } from 'bun:test';
import { reviewResultSchema } from '@noslop/contract';
import { buildMockReviewResult } from './build-mock-review-result';

test('it builds a default review result that the result schema accepts', () => {
  const result = buildMockReviewResult();

  expect(reviewResultSchema.parse(result)).toStrictEqual(result);
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockReviewResult({ depth: 'deep', repo: 'example/other' })).toMatchObject({
    depth: 'deep',
    repo: 'example/other',
    reviewID: 'review-1',
  });
});
