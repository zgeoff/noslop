import { expect, test } from 'bun:test';
import { collectMatches } from './collect-matches';

test('it matches a reported finding within the window on the same path', () => {
  expect(
    collectMatches(
      [{ lens: 'correctness', anchor: { path: 'src/a.ts', startLine: 10, endLine: 10 } }],
      [
        {
          lens: 'correctness',
          anchor: { path: 'src/a.ts', startLine: 14, endLine: 15 },
          title: 'Keep the row',
          severity: 'P2',
        },
      ],
      5,
    ),
  ).toStrictEqual([{ target: 0, reported: 0, distance: 4 }]);
});

test('it leaves a reported finding outside the window unmatched', () => {
  expect(
    collectMatches(
      [{ lens: 'correctness', anchor: { path: 'src/a.ts', startLine: 10, endLine: 10 } }],
      [
        {
          lens: 'correctness',
          anchor: { path: 'src/a.ts', startLine: 16, endLine: 16 },
          title: 'Keep the row',
          severity: 'P2',
        },
      ],
      5,
    ),
  ).toStrictEqual([]);
});

test('it never matches across paths', () => {
  expect(
    collectMatches(
      [{ lens: null, anchor: { path: 'src/a.ts', startLine: 10, endLine: 10 } }],
      [
        {
          lens: 'correctness',
          anchor: { path: 'src/b.ts', startLine: 10, endLine: 10 },
          title: 'Keep the row',
          severity: 'P2',
        },
      ],
      5,
    ),
  ).toStrictEqual([]);
});

test('it gives a target to the closest reported finding and matches each one once', () => {
  expect(
    collectMatches(
      [{ lens: null, anchor: { path: 'src/a.ts', startLine: 10, endLine: 10 } }],
      [
        {
          lens: 'correctness',
          anchor: { path: 'src/a.ts', startLine: 13, endLine: 13 },
          title: 'Far',
          severity: 'P2',
        },
        {
          lens: 'correctness',
          anchor: { path: './src/a.ts', startLine: 11, endLine: 11 },
          title: 'Near',
          severity: 'P2',
        },
      ],
      5,
    ),
  ).toStrictEqual([{ target: 0, reported: 1, distance: 1 }]);
});

test('it matches as many targets as the window allows, whatever the listed order', () => {
  const targets = [
    { lens: null, anchor: { path: 'src/a.ts', startLine: 11, endLine: 11 } },
    { lens: null, anchor: { path: 'src/a.ts', startLine: 13, endLine: 13 } },
  ];

  const near = {
    lens: null,
    anchor: { path: 'src/a.ts', startLine: 12, endLine: 12 },
    title: 'Near',
    severity: 'P2' as const,
  };

  const low = {
    lens: null,
    anchor: { path: 'src/a.ts', startLine: 10, endLine: 10 },
    title: 'Low',
    severity: 'P2' as const,
  };

  const forward = collectMatches(targets, [near, low], 1);
  const backward = collectMatches(targets, [low, near], 1);

  expect([forward.length, backward.length]).toStrictEqual([2, 2]);
});

test('it breaks a distance tie by the lens', () => {
  expect(
    collectMatches(
      [
        { lens: 'security', anchor: { path: 'src/a.ts', startLine: 10, endLine: 10 } },
        { lens: 'correctness', anchor: { path: 'src/a.ts', startLine: 10, endLine: 10 } },
      ],
      [
        {
          lens: 'correctness',
          anchor: { path: 'src/a.ts', startLine: 10, endLine: 10 },
          title: 'Keep the row',
          severity: 'P2',
        },
      ],
      5,
    ),
  ).toStrictEqual([{ target: 1, reported: 0, distance: 0 }]);
});
