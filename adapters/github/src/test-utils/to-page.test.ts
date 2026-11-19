import { expect, test } from 'bun:test';
import { toPage } from './to-page';

test('it returns the items of the requested page', () => {
  const request = new Request('https://api.github.com/repos/example/app/pulls?page=2&per_page=2');

  expect(toPage(request, ['a', 'b', 'c', 'd', 'e'])).toStrictEqual(['c', 'd']);
});

test('it returns the remaining items on the last page', () => {
  const request = new Request('https://api.github.com/repos/example/app/pulls?page=3&per_page=2');

  expect(toPage(request, ['a', 'b', 'c', 'd', 'e'])).toStrictEqual(['e']);
});

test('it returns no items past the last page', () => {
  const request = new Request('https://api.github.com/repos/example/app/pulls?page=4&per_page=2');

  expect(toPage(request, ['a', 'b', 'c', 'd', 'e'])).toStrictEqual([]);
});

test('it returns the first 30 items without page parameters', () => {
  const request = new Request('https://api.github.com/repos/example/app/pulls');

  const items = Array.from({ length: 31 }, (_, index) => index + 1);

  expect(toPage(request, items)).toStrictEqual(Array.from({ length: 30 }, (_, index) => index + 1));
});
