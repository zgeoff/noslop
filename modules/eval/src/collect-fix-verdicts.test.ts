import { expect, test } from 'bun:test';
import { collectFixVerdicts } from './collect-fix-verdicts';

test('it pairs each fix a case expects with the verdict its run gave, unjudged when no check ran', () => {
  const verdicts = collectFixVerdicts(
    [
      {
        id: 'cart-refusal',
        repo: '/repos/shop',
        base: 'a'.repeat(40),
        head: 'b'.repeat(40),
        title: 'Refuse an empty cart',
        body: '',
        findings: [],
        escapes: [],
        fixes: [
          {
            id: '1111111111111111',
            title: 'Return the empty-cart refusal as a result',
            lens: 'failure-handling-and-observability',
            path: 'src/checkout.ts',
            line: null,
            comment: 'The checkout throws for an empty cart.',
            postedHead: 'a'.repeat(40),
            commit: 'b'.repeat(40),
            expected: 'fixed',
          },
          {
            id: '2222222222222222',
            title: 'Return empty-cart refusals as a result',
            lens: 'failure-handling-and-observability',
            path: 'src/checkout.ts',
            line: null,
            comment: 'An empty cart reaches this throw.',
            postedHead: 'a'.repeat(40),
            commit: 'b'.repeat(40),
            expected: 'fixed',
          },
          {
            id: '3333333333333333',
            title: 'Name the refusal',
            lens: 'naming-shape-and-comments',
            path: 'src/checkout.ts',
            line: 1,
            comment: 'The refusal has no name.',
            postedHead: 'a'.repeat(40),
            commit: null,
            expected: 'not-fixed',
          },
        ],
      },
    ],
    [
      {
        caseID: 'cart-refusal',
        review: {
          findings: [],
          failed: false,
          tokens: { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 },
          durationMs: 0,
          calls: 1,
          depth: null,
          fixChecks: [
            { findingID: '1111111111111111', fixed: true, reason: 'It returns the refusal.' },
            { findingID: '2222222222222222', fixed: null, reason: 'its fix call failed' },
          ],
        },
      },
    ],
  );

  expect(verdicts).toStrictEqual([
    {
      caseID: 'cart-refusal',
      findingID: '1111111111111111',
      expected: 'fixed',
      verdict: 'fixed',
      reason: 'It returns the refusal.',
    },
    {
      caseID: 'cart-refusal',
      findingID: '2222222222222222',
      expected: 'fixed',
      verdict: 'unjudged',
      reason: 'its fix call failed',
    },
    {
      caseID: 'cart-refusal',
      findingID: '3333333333333333',
      expected: 'not-fixed',
      verdict: 'unjudged',
      reason: 'no fix check ran',
    },
  ]);
});

test('it reads a fixed: false check as not fixed', () => {
  const verdicts = collectFixVerdicts(
    [
      {
        id: 'cart-refusal',
        repo: '/repos/shop',
        base: 'a'.repeat(40),
        head: 'b'.repeat(40),
        title: 'Refuse an empty cart',
        body: '',
        findings: [],
        escapes: [],
        fixes: [
          {
            id: '1111111111111111',
            title: 'Return the empty-cart refusal as a result',
            lens: 'failure-handling-and-observability',
            path: 'src/checkout.ts',
            line: null,
            comment: 'The checkout throws for an empty cart.',
            postedHead: null,
            commit: null,
            expected: 'fixed',
          },
        ],
      },
    ],
    [
      {
        caseID: 'cart-refusal',
        review: {
          findings: [],
          failed: false,
          tokens: { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 },
          durationMs: 0,
          calls: 1,
          depth: null,
          fixChecks: [{ findingID: '1111111111111111', fixed: false, reason: 'It still throws.' }],
        },
      },
    ],
  );

  expect(verdicts).toStrictEqual([
    {
      caseID: 'cart-refusal',
      findingID: '1111111111111111',
      expected: 'fixed',
      verdict: 'not-fixed',
      reason: 'It still throws.',
    },
  ]);
});
