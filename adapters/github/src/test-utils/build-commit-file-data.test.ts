import { expect, test } from 'bun:test';
import { buildCommitFileData } from './build-commit-file-data';

test('it builds a changed file with its patch', () => {
  const commit = { renames: {}, patches: { 'src/app.ts': '@@ -1 +1 @@\n-old\n+new' } };

  expect(buildCommitFileData(commit, 'src/app.ts')).toStrictEqual({
    filename: 'src/app.ts',
    patch: '@@ -1 +1 @@\n-old\n+new',
  });
});

test('it builds a renamed file with its previous name and its patch', () => {
  const commit = {
    renames: { 'src/helpers.ts': 'src/utils.ts' },
    patches: { 'src/helpers.ts': '@@ -2 +2 @@\n-a\n+b' },
  };

  expect(buildCommitFileData(commit, 'src/helpers.ts')).toStrictEqual({
    filename: 'src/helpers.ts',
    status: 'renamed',
    previous_filename: 'src/utils.ts',
    patch: '@@ -2 +2 @@\n-a\n+b',
  });
});

test('it builds a file with no patch or rename as its name alone', () => {
  const commit = { renames: {}, patches: {} };

  expect(buildCommitFileData(commit, 'assets/logo.png')).toStrictEqual({
    filename: 'assets/logo.png',
  });
});
