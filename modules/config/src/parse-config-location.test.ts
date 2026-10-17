import { expect, test } from 'bun:test';
import { parseConfigLocation } from './parse-config-location';

test('it resolves a path against the directory of the file that names it', () => {
  expect(
    parseConfigLocation(
      '../shared/review.json',
      { kind: 'local', path: '/repo/review.json' },
      'review.json',
    ),
  ).toStrictEqual({ kind: 'local', path: '/shared/review.json' });
});

test('it reads a github location with a path and a ref', () => {
  expect(
    parseConfigLocation(
      'github:example/noslop-config/base.json@v2',
      { kind: 'local', path: '/repo/review.json' },
      'review.json',
    ),
  ).toStrictEqual({
    kind: 'github',
    owner: 'example',
    repo: 'noslop-config',
    path: 'base.json',
    ref: 'v2',
  });
});

test('it defaults a github location to the named file on the default branch', () => {
  expect(
    parseConfigLocation(
      'github:example/noslop-config',
      { kind: 'local', path: '/repo/review.json' },
      'review.json',
    ),
  ).toStrictEqual({
    kind: 'github',
    owner: 'example',
    repo: 'noslop-config',
    path: 'review.json',
    ref: null,
  });
});

test('it resolves a path inside a github file against that repo and ref', () => {
  expect(
    parseConfigLocation(
      './patterns.md',
      { kind: 'github', owner: 'example', repo: 'noslop-config', path: 'review.json', ref: 'v2' },
      'review.json',
    ),
  ).toStrictEqual({
    kind: 'github',
    owner: 'example',
    repo: 'noslop-config',
    path: 'patterns.md',
    ref: 'v2',
  });
});

test('it rejects a github location with no repo', () => {
  expect(() =>
    parseConfigLocation(
      'github:example',
      { kind: 'local', path: '/repo/review.json' },
      'review.json',
    ),
  ).toThrowWithMessage(Error, /is not a github/u);
});
