import { expect, test } from 'bun:test';
import { buildMockFinding } from '@noslop/testing';
import { mergeGroupedFindings } from './merge-grouped-findings';

test('it keeps the finding of each group with the highest severity', () => {
  const findings = [
    buildMockFinding({ id: 'a', severity: 'P2' }),
    buildMockFinding({ id: 'b', severity: 'P1' }),
    buildMockFinding({ id: 'c', severity: 'P3' }),
  ];

  expect(mergeGroupedFindings(findings, [['a', 'b']]).map((finding) => finding.id)).toStrictEqual([
    'b',
    'c',
  ]);
});

test('it keeps the first finding of a group whose severities tie', () => {
  const findings = [
    buildMockFinding({ id: 'a', severity: 'P2' }),
    buildMockFinding({ id: 'b', severity: 'P2' }),
  ];

  expect(mergeGroupedFindings(findings, [['b', 'a']]).map((finding) => finding.id)).toStrictEqual([
    'a',
  ]);
});

test('it ignores an unknown ID, an ID an earlier group took, and a group left with one finding', () => {
  const findings = [
    buildMockFinding({ id: 'a', severity: 'P2' }),
    buildMockFinding({ id: 'b', severity: 'P2' }),
    buildMockFinding({ id: 'c', severity: 'P2' }),
  ];

  expect(
    mergeGroupedFindings(findings, [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'missing'],
    ]).map((finding) => finding.id),
  ).toStrictEqual(['a', 'c']);
});
