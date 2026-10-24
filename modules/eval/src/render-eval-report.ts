import type { RunComparison } from './build-run-comparison';
import type { LensScore, RunScore } from './build-run-score';

export interface EvalReportInput {
  reviewer: string;
  score: RunScore;

  reference: { reviewer: string; score: RunScore } | null;

  noiseFloor: RunComparison | null;
}

export function renderEvalReport(input: EvalReportInput): string {
  const score = input.score;
  const columns = [input.reviewer, input.reference?.reviewer].filter((name) => name !== undefined);

  const lines = [
    `# Eval: ${input.reviewer}`,
    '',
    `${score.cases} cases, ${score.failedCases} failed.`,
    '',
    `| Measure | ${columns.join(' | ')} |`,
    input.reference === null ? '| --- | --- |' : '| --- | --- | --- |',
    ...renderTotals(score, input.reference?.score ?? null),
    '',
    '## Light rule',
    '',
    `${score.lightCases} cases ran at Light, holding ${score.lightP1s} labelled P1s and ${score.lightEscapes} escapes.`,
    '',
    '## Per lens',
    '',
    '| Lens | Baseline true positives | Repeated | Reported | Matched true | Matched false | Disputed | Unlabelled | Escapes caught | Silences broken |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...score.lenses.map((lens) => renderLensRow(lens)),
  ];

  if (input.noiseFloor !== null) {
    const noise = input.noiseFloor;

    lines.push(
      '',
      '## Noise floor',
      '',
      `2 runs of the reference reviewer on ${noise.cases} cases reported ${noise.findingsFirst} and ${noise.findingsSecond} findings, and ${noise.matched} of them matched: an agreement of ${formatRatio(noise.agreement)}.`,
    );
  }

  return `${lines.join('\n')}\n`;
}

function renderTotals(score: RunScore, reference: RunScore | null): string[] {
  const rows: [string, (item: RunScore) => string][] = [
    [
      'Labelled true positives repeated',
      (item) => `${item.repeatedTruePositives} of ${item.baselineTruePositives}`,
    ],
    ['Findings reported', (item) => String(item.reported)],
    ['Findings with no label', (item) => String(item.unlabelled)],
    ['Escapes caught', (item) => `${item.escapesCaught} of ${item.escapesWithAnchor}`],
    ['Silences broken', (item) => `${item.silencesBroken} of ${item.silences}`],
    ['Calls', (item) => String(item.calls)],
    ['New input tokens', (item) => String(item.tokens.input)],
    ['Cached input tokens', (item) => String(item.tokens.cachedInput)],
    ['Cache write tokens', (item) => String(item.tokens.cacheWrite)],
    ['Output tokens', (item) => String(item.tokens.output)],
    ['Duration (s)', (item) => (item.durationMs / 1000).toFixed(0)],
  ];

  return rows.map(([name, formatCell]) =>
    reference === null
      ? `| ${name} | ${formatCell(score)} |`
      : `| ${name} | ${formatCell(score)} | ${formatCell(reference)} |`,
  );
}

function renderLensRow(lens: LensScore): string {
  return `| ${lens.lens} | ${lens.baselineTruePositives} | ${lens.repeatedTruePositives} | ${lens.reported} | ${lens.matchedTruePositive} | ${lens.matchedFalsePositive} | ${lens.matchedDisputed} | ${lens.unlabelled} | ${lens.escapesCaught} | ${lens.silencesBroken} of ${lens.silences} |`;
}

function formatRatio(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}
