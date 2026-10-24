import type { StaticScore } from './build-static-score';

const DEPTHS = ['light', 'standard', 'deep'] as const;

export function renderStaticReport(score: StaticScore): string {
  const depthRows = DEPTHS.map((depth) => {
    const totals = score.depths[depth];

    return `| ${depth} | ${totals.cases} | ${totals.labelledP1s} | ${totals.escapes} | ${totals.groupCalls} | ${totals.maxCalls} |`;
  });

  const misses =
    score.lightMisses.length === 0
      ? ['No labelled P1 or escape falls at Light.']
      : score.lightMisses.map((miss) => `- ${miss.caseID} (${miss.kind}): ${miss.text}`);

  const caseRows = score.perCase.map(
    (item) => `| ${item.caseID} | ${item.depth} | ${item.groupCalls} | ${item.maxCalls} |`,
  );

  return [
    '# Static depth replay',
    '',
    `${score.cases} cases, ${score.failed} failed to plan.`,
    '',
    '| Depth | Cases | Labelled P1s | Escapes | Planned calls | Most calls |',
    '| --- | --- | --- | --- | --- | --- |',
    ...depthRows,
    '',
    '## At Light',
    '',
    ...misses,
    '',
    '## Calls per case',
    '',
    '| Case | Depth | Planned calls | Most calls |',
    '| --- | --- | --- | --- |',
    ...caseRows,
    '',
  ].join('\n');
}
