import { expect, test } from 'bun:test';
import { renderStaticReport } from './render-static-report';

test('it renders the depth table, the Light misses and the calls per case', () => {
  expect(
    renderStaticReport({
      cases: 2,
      failed: 0,
      depths: {
        light: { cases: 1, labelledP1s: 1, escapes: 0, groupCalls: 1, maxCalls: 1 },
        standard: { cases: 0, labelledP1s: 0, escapes: 0, groupCalls: 0, maxCalls: 0 },
        deep: { cases: 1, labelledP1s: 0, escapes: 2, groupCalls: 3, maxCalls: 5 },
      },
      lightMisses: [{ caseID: 'case-light', kind: 'p1', text: 'Keep the lock' }],
      perCase: [
        { caseID: 'case-light', depth: 'light', groupCalls: 1, maxCalls: 1 },
        { caseID: 'case-deep', depth: 'deep', groupCalls: 3, maxCalls: 5 },
      ],
    }),
  ).toMatchInlineSnapshot(`
    "# Static depth replay

    2 cases, 0 failed to plan.

    | Depth | Cases | Labelled P1s | Escapes | Planned calls | Most calls |
    | --- | --- | --- | --- | --- | --- |
    | light | 1 | 1 | 0 | 1 | 1 |
    | standard | 0 | 0 | 0 | 0 | 0 |
    | deep | 1 | 0 | 2 | 3 | 5 |

    ## At Light

    - case-light (p1): Keep the lock

    ## Calls per case

    | Case | Depth | Planned calls | Most calls |
    | --- | --- | --- | --- |
    | case-light | light | 1 | 1 |
    | case-deep | deep | 3 | 5 |
    "
  `);
});

test('it says so when no labelled P1 or escape falls at Light', () => {
  expect(
    renderStaticReport({
      cases: 0,
      failed: 0,
      depths: {
        light: { cases: 0, labelledP1s: 0, escapes: 0, groupCalls: 0, maxCalls: 0 },
        standard: { cases: 0, labelledP1s: 0, escapes: 0, groupCalls: 0, maxCalls: 0 },
        deep: { cases: 0, labelledP1s: 0, escapes: 0, groupCalls: 0, maxCalls: 0 },
      },
      lightMisses: [],
      perCase: [],
    }),
  ).toInclude('No labelled P1 or escape falls at Light.');
});
