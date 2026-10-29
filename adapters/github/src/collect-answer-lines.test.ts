import { expect, test } from 'bun:test';
import { collectAnswerLines } from './collect-answer-lines';

test.each<[string, string, ReturnType<typeof collectAnswerLines>]>([
  ['a one-answer reply', 'fixed 1a2b3c4', []],
  [
    'one line per finding',
    '1111111111111111 fixed 1a2b3c4\n2222222222222222 not-a-defect the guard runs first',
    [
      { findingID: '1111111111111111', answer: 'fixed 1a2b3c4' },
      { findingID: '2222222222222222', answer: 'not-a-defect the guard runs first' },
    ],
  ],
  [
    'lines that stop at the first line with no id',
    '1111111111111111 fixed\n\n2222222222222222 fixed 1a2b3c4',
    [{ findingID: '1111111111111111', answer: 'fixed' }],
  ],
  ['an id with no answer', '1111111111111111', []],
  ['an id of 15 characters', '111111111111111 fixed', []],
])('it reads %s', (_, reply, expected) => {
  expect(collectAnswerLines(reply)).toStrictEqual(expected);
});
