import { expect, test } from 'bun:test';
import { isSameTitle } from './is-same-title';

test('it matches 2 titles that differ only in case and punctuation', () => {
  expect(isSameTitle('Close the socket.', 'close the SOCKET', 3)).toBe(true);
});

test('it matches 2 wordings that share every word of the shorter title', () => {
  expect(
    isSameTitle(
      'Return the empty-cart refusal as a result',
      'Return empty-cart refusals as a result',
      3,
    ),
  ).toBe(true);
});

test('it keeps apart 2 titles that name different code', () => {
  expect(
    isSameTitle('Delete the comment above parseOrder', 'Delete the comment above formatOrder', 3),
  ).toBe(false);
});

test('it keeps apart 2 titles that share fewer words than the minimum', () => {
  expect(isSameTitle('Close the socket', 'Close the socket on exit', 3)).toBe(false);
});
