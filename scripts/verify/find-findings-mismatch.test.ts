import { expect, test } from 'bun:test';
import { findFindingsMismatch } from './find-findings-mismatch.ts';

test.each([
  { name: 'some open', states: ['open', 'not-a-defect'], open: 'some', fixed: undefined },
  { name: 'none open', states: ['fixed', 'not-a-defect'], open: 'none', fixed: undefined },
  { name: 'none open and some fixed', states: ['fixed'], open: 'none', fixed: 'some' },
  { name: 'none open of no findings', states: [], open: 'none', fixed: undefined },
] as const)('it matches a list with $name', (row) => {
  const findings = row.states.map((state) => ({ state }));

  expect(findFindingsMismatch(findings, { open: row.open, fixed: row.fixed })).toBeNull();
});

test.each([
  {
    name: 'an open finding where none may be',
    states: ['open', 'fixed'],
    open: 'none',
    fixed: undefined,
    reason: '1 findings are open, and the journey expects none',
  },
  {
    name: 'no open finding where some must be',
    states: ['not-a-defect'],
    open: 'some',
    fixed: undefined,
    reason: 'no finding is open, and the journey expects some',
  },
  {
    name: 'no fixed finding where some must be',
    states: ['not-a-defect'],
    open: 'none',
    fixed: 'some',
    reason: 'no finding is fixed, and the journey expects some',
  },
] as const)('it names $name', (row) => {
  const findings = row.states.map((state) => ({ state }));

  expect(findFindingsMismatch(findings, { open: row.open, fixed: row.fixed })).toBe(row.reason);
});
