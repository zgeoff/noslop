import { expect, test } from 'bun:test';
import { parseDisposition } from './parse-disposition';

test.each<[string, ReturnType<typeof parseDisposition>]>([
  ['fixed 1a2b3c4', { kind: 'fixed', value: '1a2b3c4' }],
  ['fixed', { kind: 'fixed', value: '' }],
  ['fixed\n\nThe loop stops at the last row now.', { kind: 'fixed', value: '' }],
  [
    'not-a-defect the caller holds the lock: src/queue/claim.ts:41',
    { kind: 'not-a-defect', value: 'the caller holds the lock: src/queue/claim.ts:41' },
  ],
  ['deferred #123', { kind: 'deferred', value: '#123' }],
  [
    'accepted-risk single-tenant deploy; no shared rows\n\nMore context.',
    { kind: 'accepted-risk', value: 'single-tenant deploy; no shared rows' },
  ],
])('it parses %p as a disposition', (reply, expected) => {
  expect(parseDisposition(reply)).toStrictEqual(expected);
});

test.each([
  ['free text', 'Good catch, I will look at it.'],
  ['a kind with no value', 'not-a-defect'],
  ['a fixed with free text after it', 'fixed the loop'],
  ['an unknown kind', 'wontfix later'],
  ['a disposition after the first line', 'Thanks!\nfixed 1a2b3c4'],
])('it reads %s as no disposition', (_, reply) => {
  expect(parseDisposition(reply)).toBeNull();
});
