import { expect, test } from 'bun:test';
import { findReplyDisposition } from './find-reply-disposition';

test.each<[string, string, ReturnType<typeof findReplyDisposition>]>([
  [
    'a one-answer reply for every finding',
    'not-a-defect the guard runs first\n\nThe guard sits in the caller.',
    { kind: 'not-a-defect', value: 'the guard runs first' },
  ],
  [
    'the line that names the finding',
    '2222222222222222 fixed 1a2b3c4\n1111111111111111 not-a-defect the guard runs first',
    { kind: 'not-a-defect', value: 'the guard runs first' },
  ],
  [
    'the last of two lines that name the finding',
    '1111111111111111 fixed\n1111111111111111 fixed 1a2b3c4',
    { kind: 'fixed', value: '1a2b3c4' },
  ],
  [
    'lines with an explanation after them',
    '1111111111111111 fixed 1a2b3c4\n\nThe loop starts at the first item.',
    { kind: 'fixed', value: '1a2b3c4' },
  ],
  ['lines that leave the finding out', '2222222222222222 fixed 1a2b3c4', null],
  [
    'lines where another line holds no disposition',
    '1111111111111111 fixed 1a2b3c4\n2222222222222222 will look later',
    null,
  ],
  ['free text', 'Thanks, I will look at it.', null],
])('it reads %p for the finding 1111111111111111', (_, reply, expected) => {
  expect(findReplyDisposition(reply, '1111111111111111')).toStrictEqual(expected);
});
