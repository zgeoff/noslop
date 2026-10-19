import { expect, test } from 'bun:test';
import { buildFixFileEvidence } from './build-fix-file-evidence';

test("it counts a commit that changes only a test of the pull request, outside the finding's file", () => {
  expect(
    buildFixFileEvidence({
      commitFiles: ['src/parse.test.ts'],
      pullRequestFiles: ['src/parse.ts', 'src/parse.test.ts'],
      findingPath: 'src/parse.ts',
    }),
  ).toStrictEqual({ changesPullRequest: true, changesFindingFile: false });
});

test("it counts a commit that changes the finding's file", () => {
  expect(
    buildFixFileEvidence({
      commitFiles: ['src/parse.ts', 'src/parse.test.ts'],
      pullRequestFiles: ['src/parse.ts', 'src/parse.test.ts'],
      findingPath: 'src/parse.ts',
    }),
  ).toStrictEqual({ changesPullRequest: true, changesFindingFile: true });
});

test('it counts no commit that changes only files outside the pull request', () => {
  expect(
    buildFixFileEvidence({
      commitFiles: ['docs/notes.md'],
      pullRequestFiles: ['src/parse.ts'],
      findingPath: 'src/parse.ts',
    }),
  ).toStrictEqual({ changesPullRequest: false, changesFindingFile: false });
});

test('it counts no commit that changes no file', () => {
  expect(
    buildFixFileEvidence({
      commitFiles: [],
      pullRequestFiles: ['src/parse.ts'],
      findingPath: 'src/parse.ts',
    }),
  ).toStrictEqual({ changesPullRequest: false, changesFindingFile: false });
});
