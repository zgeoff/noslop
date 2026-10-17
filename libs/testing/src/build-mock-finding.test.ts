import { expect, test } from 'bun:test';
import { findingSchema } from '@noslop/contract';
import { buildMockFinding } from './build-mock-finding';

test('it builds a default finding that the finding schema accepts', () => {
  const finding = buildMockFinding();

  expect(findingSchema.parse(finding)).toStrictEqual(finding);
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockFinding({ lens: 'security', severity: 'P1' })).toMatchObject({
    lens: 'security',
    severity: 'P1',
    callID: 'L',
  });
});
