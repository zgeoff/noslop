import { expect, test } from 'bun:test';
import { collectTempLeftovers } from './collect-temp-leftovers';

test('it collects each folder of its own namespace with the PID that made it', () => {
  expect(
    collectTempLeftovers(
      ['pid4182-ns4026531836-noslop-store-a1b2c3', 'pid77-ns4026531836-x'],
      '4026531836',
    ),
  ).toStrictEqual([
    { name: 'pid4182-ns4026531836-noslop-store-a1b2c3', pid: 4182 },
    { name: 'pid77-ns4026531836-x', pid: 77 },
  ]);
});

test.each([
  ['a folder of another namespace', 'pid4182-ns4026532001-noslop-store-a1b2c3'],
  ['a folder with no run prefix', 'noslop-store-a1b2c3'],
  ['a folder whose PID is not a number', 'pidabc-ns4026531836-noslop-store-a1b2c3'],
])('it leaves out %s', (_label, name) => {
  expect(collectTempLeftovers([name], '4026531836')).toStrictEqual([]);
});
