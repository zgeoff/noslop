import { expect, test } from 'bun:test';
import { formatConfigLocation } from './format-config-location';

test('it formats a github location with its ref', () => {
  expect(
    formatConfigLocation({
      kind: 'github',
      owner: 'example',
      repo: 'noslop-config',
      path: 'review.json',
      ref: 'v2',
    }),
  ).toBe('github:example/noslop-config/review.json@v2');
});

test('it formats a local location as its path', () => {
  expect(formatConfigLocation({ kind: 'local', path: '/repo/review.json' })).toBe(
    '/repo/review.json',
  );
});
