import { expect, test } from 'bun:test';
import { buildCompareData } from './build-compare-data';

test('it compares a base behind the head as ahead, with the commits and files between them', () => {
  const records = [
    { sha: 'a'.repeat(40), files: ['README.md'], renames: {}, isOnBranch: true },
    { sha: 'b'.repeat(40), files: ['src/app.ts'], renames: {}, isOnBranch: true },
    {
      sha: 'c'.repeat(40),
      files: ['src/helpers.ts'],
      renames: { 'src/helpers.ts': 'src/utils.ts' },
      isOnBranch: true,
    },
  ];

  const request = { base: 'a'.repeat(40), head: 'c'.repeat(40), search: new URLSearchParams() };

  expect(buildCompareData(records, request)).toStrictEqual({
    status: 'ahead',
    merge_base_commit: { sha: 'a'.repeat(40) },
    commits: [{ sha: 'b'.repeat(40) }, { sha: 'c'.repeat(40) }],
    files: [
      { filename: 'src/app.ts' },
      { filename: 'src/helpers.ts', status: 'renamed', previous_filename: 'src/utils.ts' },
    ],
  });
});

test('it compares a base ahead of the head as behind, with the head as merge base', () => {
  const records = [
    { sha: 'a'.repeat(40), files: ['README.md'], renames: {}, isOnBranch: true },
    { sha: 'b'.repeat(40), files: ['src/app.ts'], renames: {}, isOnBranch: true },
  ];

  const request = { base: 'b'.repeat(40), head: 'a'.repeat(40), search: new URLSearchParams() };

  expect(buildCompareData(records, request)).toStrictEqual({
    status: 'behind',
    merge_base_commit: { sha: 'a'.repeat(40) },
    commits: [],
    files: [],
  });
});

test('it compares a commit with itself as identical', () => {
  const records = [
    { sha: 'a'.repeat(40), files: ['README.md'], renames: {}, isOnBranch: true },
    { sha: 'b'.repeat(40), files: ['src/app.ts'], renames: {}, isOnBranch: true },
  ];

  const request = { base: 'b'.repeat(40), head: 'b'.repeat(40), search: new URLSearchParams() };

  expect(buildCompareData(records, request)).toStrictEqual({
    status: 'identical',
    merge_base_commit: { sha: 'b'.repeat(40) },
    commits: [],
    files: [],
  });
});

test('it compares a head off the base branch as diverged', () => {
  const records = [
    { sha: 'a'.repeat(40), files: ['README.md'], renames: {}, isOnBranch: true },
    { sha: 'd'.repeat(40), files: ['src/feature.ts'], renames: {}, isOnBranch: false },
  ];

  const request = { base: 'a'.repeat(40), head: 'd'.repeat(40), search: new URLSearchParams() };

  expect(buildCompareData(records, request)).toStrictEqual({
    status: 'diverged',
    merge_base_commit: { sha: 'a'.repeat(40) },
    commits: [{ sha: 'd'.repeat(40) }],
    files: [{ filename: 'src/feature.ts' }],
  });
});

test('it lists only the requested page of commits', () => {
  const records = [
    { sha: 'a'.repeat(40), files: ['README.md'], renames: {}, isOnBranch: true },
    { sha: 'b'.repeat(40), files: ['src/app.ts'], renames: {}, isOnBranch: true },
    { sha: 'c'.repeat(40), files: ['src/lib.ts'], renames: {}, isOnBranch: true },
  ];

  const request = {
    base: 'a'.repeat(40),
    head: 'c'.repeat(40),
    search: new URLSearchParams({ page: '2', per_page: '1' }),
  };

  expect(buildCompareData(records, request)).toStrictEqual({
    status: 'ahead',
    merge_base_commit: { sha: 'a'.repeat(40) },
    commits: [{ sha: 'c'.repeat(40) }],
    files: [{ filename: 'src/app.ts' }, { filename: 'src/lib.ts' }],
  });
});

test('it finds no comparison for a short base that matches no commit', () => {
  const records = [{ sha: 'a'.repeat(40), files: ['README.md'], renames: {}, isOnBranch: true }];
  const request = { base: 'f00d', head: 'a'.repeat(40), search: new URLSearchParams() };

  expect(buildCompareData(records, request)).toBeNull();
});

test('it reports a short base that matches several commits as ambiguous', () => {
  const records = [
    { sha: `ab${'1'.repeat(38)}`, files: ['README.md'], renames: {}, isOnBranch: true },
    { sha: `ab${'2'.repeat(38)}`, files: ['src/app.ts'], renames: {}, isOnBranch: true },
  ];

  const request = { base: 'ab', head: `ab${'2'.repeat(38)}`, search: new URLSearchParams() };

  expect(buildCompareData(records, request)).toBe('ambiguous');
});
