import { expect, test } from 'bun:test';
import { pickTempLeftovers } from './pick-temp-leftovers';

test("it picks the folders of a finished run in the sweep's own namespace", () => {
  expect(
    pickTempLeftovers(['pid111-ns5-noslop-store-a1'], '5', new Map([[111, false]])),
  ).toStrictEqual(['pid111-ns5-noslop-store-a1']);
});

test('it never picks the folders of a run that is still going', () => {
  expect(
    pickTempLeftovers(['pid222-ns5-noslop-store-b2'], '5', new Map([[222, true]])),
  ).toStrictEqual([]);
});

test('it never picks a folder whose process it has no state for', () => {
  expect(pickTempLeftovers(['pid333-ns5-noslop-store-c3'], '5', new Map())).toStrictEqual([]);
});

test('it never picks a folder of another namespace or one with no run prefix', () => {
  expect(
    pickTempLeftovers(
      ['pid111-ns6-noslop-store-d4', 'noslop-store-e5'],
      '5',
      new Map([[111, false]]),
    ),
  ).toStrictEqual([]);
});
