import { expect, test } from 'bun:test';
import { parseDisposition } from './parse-disposition';

test.each<[string, ReturnType<typeof parseDisposition>]>([
  ['fixed 1a2b3c4', { kind: 'fixed', value: '1a2b3c4' }],
  ['fixed', { kind: 'fixed', value: '' }],
  ['fixed 1a2b3c4.', { kind: 'fixed', value: '1a2b3c4' }],
  ['fixed 1a2b3c4 and 5d6e7f8.', { kind: 'fixed', value: '1a2b3c4' }],
  ['fixed 1a2b3c4 — renamed the helper', { kind: 'fixed', value: '1a2b3c4' }],
  ['fixed 1a2b3c4: the loop stops at the last row', { kind: 'fixed', value: '1a2b3c4' }],
  [
    'fixed 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b',
    { kind: 'fixed', value: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b' },
  ],
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
  ['a fixed with free text before the sha', 'fixed in 1a2b3c4'],
  ['a fixed with a sha shorter than 7 characters', 'fixed 1a2b3c.'],
  [
    'a fixed with a sha longer than 40 characters',
    'fixed 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1',
  ],
  ['a fixed with letters joined to the sha', 'fixed 1a2b3c4xyz'],
  ['a fixed with an underscore joined to the sha', 'fixed 1a2b3c4_x'],
  ['a fixed with an uppercase sha', 'fixed 1A2B3C4'],
  ['an unknown kind', 'wontfix later'],
  ['a disposition after the first line', 'Thanks!\nfixed 1a2b3c4'],
])('it reads %s as no disposition', (_, reply) => {
  expect(parseDisposition(reply)).toBeNull();
});
