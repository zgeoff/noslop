import { expect, test } from 'bun:test';
import { droppedFindingSchema } from '@noslop/contract';
import { buildMockDroppedFinding } from './build-mock-dropped-finding';

test('it builds a default dropped finding that the dropped finding schema accepts', () => {
  const dropped = buildMockDroppedFinding();

  expect(droppedFindingSchema.parse(dropped)).toStrictEqual(dropped);
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockDroppedFinding({ reason: 'anchor-outside-diff', rule: null })).toMatchObject({
    reason: 'anchor-outside-diff',
    rule: null,
    callID: 'light',
  });
});
