import { expect, test } from 'bun:test';
import type { FixState, FixVerdict } from './pick-next-fix-state';
import { FIX_TRANSITIONS, HELD_FIX_STATES, pickNextFixState } from './pick-next-fix-state';

test('it declares a move for every state and every verdict', () => {
  expect(
    Object.entries(FIX_TRANSITIONS).map(([from, moves]) => [from, Object.keys(moves).toSorted()]),
  ).toStrictEqual([
    ['silent', ['confirmed', 'none', 'rejected']],
    ['confirmed', ['confirmed', 'none', 'rejected']],
    ['retained', ['confirmed', 'none', 'rejected']],
    ['rejected', ['confirmed', 'none', 'rejected']],
  ]);
});

test.each<[FixState, FixVerdict, FixState]>([
  ['silent', 'confirmed', 'confirmed'],
  ['silent', 'rejected', 'rejected'],
  ['silent', 'none', 'silent'],
  ['confirmed', 'confirmed', 'confirmed'],
  ['confirmed', 'rejected', 'rejected'],
  ['confirmed', 'none', 'retained'],
  ['retained', 'confirmed', 'confirmed'],
  ['retained', 'rejected', 'rejected'],
  ['retained', 'none', 'retained'],
  ['rejected', 'confirmed', 'confirmed'],
  ['rejected', 'rejected', 'rejected'],
  ['rejected', 'none', 'rejected'],
])('it moves a %s fix on a %s verdict to %s', (from, verdict, to) => {
  expect(pickNextFixState(from, verdict)).toBe(to);
});

test('it holds a fix only while it is confirmed or retained', () => {
  expect([...HELD_FIX_STATES].toSorted()).toStrictEqual(['confirmed', 'retained']);
});
