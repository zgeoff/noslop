import { expect, test } from 'bun:test';
import { findReviewBase } from './find-review-base';

test('it finds the base of the lens review of the head, past a later fixes-only run', () => {
  expect(
    findReviewBase(
      [
        { base: 'c'.repeat(40), head: 'c'.repeat(40), isLensReview: false },
        { base: 'a'.repeat(40), head: 'b'.repeat(40), isLensReview: true },
      ],
      'b'.repeat(40),
    ),
  ).toBe('a'.repeat(40));
});

test('it follows a delta review back to the base of the review whose head it starts from', () => {
  expect(
    findReviewBase(
      [
        { base: 'c'.repeat(40), head: 'd'.repeat(40), isLensReview: true },
        { base: 'b'.repeat(40), head: 'c'.repeat(40), isLensReview: false },
        { base: 'a'.repeat(40), head: 'b'.repeat(40), isLensReview: true },
      ],
      'd'.repeat(40),
    ),
  ).toBe('a'.repeat(40));
});

test('it passes over a run whose base is its own head', () => {
  expect(
    findReviewBase(
      [
        { base: 'b'.repeat(40), head: 'c'.repeat(40), isLensReview: true },
        { base: 'b'.repeat(40), head: 'b'.repeat(40), isLensReview: false },
      ],
      'c'.repeat(40),
    ),
  ).toBe('b'.repeat(40));
});

test('it finds no base when the store holds no lens review of the head', () => {
  expect(
    findReviewBase(
      [{ base: 'a'.repeat(40), head: 'b'.repeat(40), isLensReview: false }],
      'b'.repeat(40),
    ),
  ).toBeNull();
});
