import { expect, test } from 'bun:test';
import { findChangedPaths } from './find-changed-paths';

test('it names each path whose patch id differs between the 2 keys, one only a key holds among them', () => {
  expect(
    findChangedPaths(
      {
        head: 'a'.repeat(40),
        key: { files: { 'src/a.ts': '1111111111111111', 'src/b.ts': '2222222222222222' } },
        reviews: 1,
        reported: [],
        failedCalls: 0,
        followUps: [],
        confirmed: [],
      },
      'b'.repeat(40),
      { files: { 'src/a.ts': '1111111111111111', 'src/c.ts': '3333333333333333' } },
    ),
  ).toStrictEqual(['src/b.ts', 'src/c.ts']);
});

test('it names no path when every patch id matches at a new head', () => {
  expect(
    findChangedPaths(
      {
        head: 'a'.repeat(40),
        key: { files: { 'src/a.ts': '1111111111111111' } },
        reviews: 1,
        reported: [],
        failedCalls: 0,
        followUps: [],
        confirmed: [],
      },
      'b'.repeat(40),
      { files: { 'src/a.ts': '1111111111111111' } },
    ),
  ).toStrictEqual([]);
});

test('it names no path at the head of a summary with no key', () => {
  expect(
    findChangedPaths(
      {
        head: 'a'.repeat(40),
        reviews: 1,
        reported: [],
        failedCalls: 0,
        followUps: [],
        confirmed: [],
      },
      'a'.repeat(40),
      { files: { 'src/a.ts': '1111111111111111' } },
    ),
  ).toStrictEqual([]);
});

test('it matches no file at a new head when either key is on a head', () => {
  expect(
    findChangedPaths(
      {
        head: 'a'.repeat(40),
        key: { files: { 'src/a.ts': '1111111111111111' } },
        reviews: 1,
        reported: [],
        failedCalls: 0,
        followUps: [],
        confirmed: [],
      },
      'b'.repeat(40),
      { head: 'b'.repeat(40) },
    ),
  ).toBeNull();
});
