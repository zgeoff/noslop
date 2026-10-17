import { expect, test } from 'bun:test';
import { renderEvalReport } from './render-eval-report';

test('it renders the totals, the Light rule, each lens and the noise floor', () => {
  const report = renderEvalReport({
    reviewer: 'noslop-codex',
    score: {
      cases: 2,
      failedCases: 0,
      lenses: [
        {
          lens: 'correctness',
          baselineTruePositives: 3,
          repeatedTruePositives: 2,
          reported: 4,
          matchedTruePositive: 2,
          matchedFalsePositive: 1,
          matchedDisputed: 0,
          unlabelled: 1,
          escapesCaught: 1,
        },
      ],
      baselineTruePositives: 3,
      repeatedTruePositives: 2,
      reported: 4,
      unlabelled: 1,
      escapesCaught: 1,
      escapesWithAnchor: 2,
      lightCases: 1,
      lightP1s: 0,
      lightEscapes: 0,
      tokens: { input: 1000, cachedInput: 9000, cacheWrite: 300, output: 200 },
      durationMs: 60_000,
      calls: 5,
    },
    reference: {
      reviewer: 'baseline',
      score: {
        cases: 2,
        failedCases: 0,
        lenses: [],
        baselineTruePositives: 3,
        repeatedTruePositives: 3,
        reported: 5,
        unlabelled: 0,
        escapesCaught: 0,
        escapesWithAnchor: 2,
        lightCases: 0,
        lightP1s: 0,
        lightEscapes: 0,
        tokens: { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 },
        durationMs: 120_000,
        calls: 2,
      },
    },
    noiseFloor: { cases: 2, findingsFirst: 5, findingsSecond: 4, matched: 3, agreement: 0.5 },
  });

  expect(report).toMatchInlineSnapshot(`
    "# Eval: noslop-codex

    2 cases, 0 failed.

    | Measure | noslop-codex | baseline |
    | --- | --- | --- |
    | Labelled true positives repeated | 2 of 3 | 3 of 3 |
    | Findings reported | 4 | 5 |
    | Findings with no label | 1 | 0 |
    | Escapes caught | 1 of 2 | 0 of 2 |
    | Calls | 5 | 2 |
    | New input tokens | 1000 | 0 |
    | Cached input tokens | 9000 | 0 |
    | Cache write tokens | 300 | 0 |
    | Output tokens | 200 | 0 |
    | Duration (s) | 60 | 120 |

    ## Light rule

    1 cases ran at Light, holding 0 labelled P1s and 0 escapes.

    ## Per lens

    | Lens | Baseline true positives | Repeated | Reported | Matched true | Matched false | Disputed | Unlabelled | Escapes caught |
    | --- | --- | --- | --- | --- | --- | --- | --- | --- |
    | correctness | 3 | 2 | 4 | 2 | 1 | 0 | 1 | 1 |

    ## Noise floor

    2 runs of the reference reviewer on 2 cases reported 5 and 4 findings, and 3 of them matched: an agreement of 50%.
    "
  `);
});

test('it leaves out the baseline column and the noise floor when the run has neither', () => {
  const report = renderEvalReport({
    reviewer: 'noslop-claude',
    score: {
      cases: 1,
      failedCases: 1,
      lenses: [],
      baselineTruePositives: 0,
      repeatedTruePositives: 0,
      reported: 0,
      unlabelled: 0,
      escapesCaught: 0,
      escapesWithAnchor: 0,
      lightCases: 0,
      lightP1s: 0,
      lightEscapes: 0,
      tokens: { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 },
      durationMs: 0,
      calls: 0,
    },
    reference: null,
    noiseFloor: null,
  });

  expect([
    report.includes('| Measure | noslop-claude |'),
    report.includes('Noise floor'),
  ]).toStrictEqual([true, false]);
});
