import { expect, test } from 'bun:test';
import { buildMockDispositionRow } from './build-mock-disposition-row';

test('it builds a default disposition row', () => {
  expect(buildMockDispositionRow()).toStrictEqual({
    repo: 'example/app',
    finding_id: expect.stringMatching(/^[0-9a-f]{16}$/u),
    kind: 'deferred',
    value: expect.any(String),
    author: expect.any(String),
    author_is_owner: 0,
    source: 'github',
    at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/u),
    pull_request: expect.any(Number),
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockDispositionRow({ kind: 'not-a-defect', pull_request: null })).toMatchObject({
    kind: 'not-a-defect',
    pull_request: null,
  });
});
