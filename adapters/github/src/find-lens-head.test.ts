import { expect, test } from 'bun:test';
import { findLensHead } from './find-lens-head';

test('it reads the lens head a marker keeps', () => {
  expect(
    findLensHead({
      head: 'b'.repeat(40),
      lensHead: 'a'.repeat(40),
      reviews: 1,
      reported: [],
      failedCalls: 1,
      followUps: [],
      confirmed: [],
      checked: [],
    }),
  ).toBe('a'.repeat(40));
});

test("it counts an older marker's own head when its lens review had no failed call", () => {
  expect(
    findLensHead({
      head: 'b'.repeat(40),
      reviews: 1,
      reported: [],
      failedCalls: 0,
      followUps: [],
      confirmed: [],
    }),
  ).toBe('b'.repeat(40));
});

test.each([
  ['a lens review with a failed call', { failedCalls: 1 }],
  ['a fixes-only run', { failedCalls: 0, checked: [] }],
])('it finds no lens head in an older marker of %s', (_, fields) => {
  expect(
    findLensHead({
      head: 'b'.repeat(40),
      reviews: 1,
      reported: [],
      followUps: [],
      confirmed: [],
      ...fields,
    }),
  ).toBeNull();
});

test('it finds no lens head without a marker', () => {
  expect(findLensHead(null)).toBeNull();
});
