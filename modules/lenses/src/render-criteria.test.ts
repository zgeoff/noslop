import { expect, test } from 'bun:test';
import { renderCriteria } from './render-criteria';

test('it gives each criterion a row with the severity it sets', () => {
  const rows = renderCriteria().split('\n');

  expect([rows.length, rows[2], rows.at(-1)]).toStrictEqual([
    19,
    '| `security-defect` | P1 | A security defect |',
    '| `noisy-log` | P3 | A log on a hot or success path that adds noise |',
  ]);
});
