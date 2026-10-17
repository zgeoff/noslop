import { expect, test } from 'bun:test';
import { resolveCasePaths } from './resolve-case-paths';

test('it resolves each labelled path to the file it names at the head', () => {
  const resolved = resolveCasePaths(
    {
      id: 'case-a',
      repo: 'repo',
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      title: 'Change the lanes',
      body: '',
      findings: [
        {
          anchor: { path: 'checkout/src/lanes.ts', startLine: 4, endLine: 4 },
          title: 'Keep the lane order',
          severity: 'P2',
          lens: 'correctness',
          label: 'true-positive',
        },
        {
          anchor: { path: 'client/picker.ts', startLine: 9, endLine: 9 },
          title: 'Close the picker',
          severity: 'P3',
          lens: null,
          label: 'false-positive',
        },
        {
          anchor: { path: 'src/main.ts', startLine: 1, endLine: 1 },
          title: 'Start the server',
          severity: 'P2',
          lens: null,
          label: 'disputed',
        },
        {
          anchor: { path: 'index.ts', startLine: 2, endLine: 2 },
          title: 'Export the lanes',
          severity: 'P3',
          lens: null,
          label: 'true-positive',
        },
        {
          anchor: { path: 'gone/old.ts', startLine: 3, endLine: 3 },
          title: 'Drop the old path',
          severity: 'P3',
          lens: null,
          label: 'true-positive',
        },
      ],
      escapes: [
        {
          defect: 'The lanes skip the last one',
          anchor: { path: 'checkout/src/lanes.ts', startLine: 7, endLine: 7 },
          visibleInDiff: true,
        },
        { defect: 'The picker leaks', visibleInDiff: false },
      ],
    },
    ['src/lanes.ts', 'src/client/picker.ts', 'src/main.ts', 'src/index.ts', 'web/index.ts'],
  );

  expect(resolved.findings.map((finding) => finding.anchor.path)).toStrictEqual([
    'src/lanes.ts',
    'src/client/picker.ts',
    'src/main.ts',
    'index.ts',
    'gone/old.ts',
  ]);

  expect(resolved.escapes).toStrictEqual([
    {
      defect: 'The lanes skip the last one',
      anchor: { path: 'src/lanes.ts', startLine: 7, endLine: 7 },
      visibleInDiff: true,
    },
    { defect: 'The picker leaks', visibleInDiff: false },
  ]);
});
