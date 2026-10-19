import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getLogger } from '@logtape/logtape';
import { BUILT_IN_DEFAULTS } from '@noslop/config';
import { buildMockChangedFile, buildStubAdapter } from '@noslop/testing';
import { runDesignPass } from './run-design-pass';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'noslop-design-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir, logger: getLogger(['test']) };
}

test('it reports only the first design finding when the call returns 2', async () => {
  const ctx = await setupTest();

  const stub = buildStubAdapter({
    design: [
      {
        findings: {
          design: [
            {
              title: 'Split the header line with the library parser',
              body: 'Each review patched the hand-written scanner for another separator case.',
              anchor: { path: 'src/a.ts', startLine: 1, endLine: 1 },
              secondLocation: null,
              severity: 'P2',
              criterion: 'design-defect',
              rule: null,
              ruleQuote: null,
              verdict: 'CONFIRMED',
              unverifiedFact: null,
              missingChange: false,
              fix: 'Replace the scanner with the parser the library exports.',
            },
            {
              title: 'Read the separators from one table',
              body: 'Each separator case adds another branch to the scanner.',
              anchor: { path: 'src/a.ts', startLine: 1, endLine: 1 },
              secondLocation: null,
              severity: 'P2',
              criterion: 'design-defect',
              rule: null,
              ruleQuote: null,
              verdict: 'CONFIRMED',
              unverifiedFact: null,
              missingChange: false,
              fix: 'Look each separator up in one table.',
            },
          ],
        },
      },
    ],
  });

  const pass = await runDesignPass({
    title: 'Parse the header line',
    body: 'Parses the header line.',
    latest: [],
    earlier: [],
    files: [buildMockChangedFile()],
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
    riskClasses: [],
    config: BUILT_IN_DEFAULTS,
    adapter: stub.adapter,
    callID: 'design',
    depth: 'standard',
    worktree: ctx.dir,
    tempDir: ctx.dir,
    logger: ctx.logger,
  });

  expect(pass.findings.map((finding) => finding.title)).toStrictEqual([
    'Split the header line with the library parser',
  ]);
});

test('it reports the finding of a retry when the first design attempt fails', async () => {
  const ctx = await setupTest();

  const stub = buildStubAdapter({
    design: [
      { error: 'the model CLI timed out' },
      {
        findings: {
          design: [
            {
              title: 'Split the header line with the library parser',
              body: 'Each review patched the hand-written scanner for another separator case.',
              anchor: { path: 'src/a.ts', startLine: 1, endLine: 1 },
              secondLocation: null,
              severity: 'P2',
              criterion: 'design-defect',
              rule: null,
              ruleQuote: null,
              verdict: 'CONFIRMED',
              unverifiedFact: null,
              missingChange: false,
              fix: 'Replace the scanner with the parser the library exports.',
            },
          ],
        },
      },
    ],
  });

  const pass = await runDesignPass({
    title: 'Parse the header line',
    body: 'Parses the header line.',
    latest: [],
    earlier: [],
    files: [buildMockChangedFile()],
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
    riskClasses: [],
    config: BUILT_IN_DEFAULTS,
    adapter: stub.adapter,
    callID: 'design',
    depth: 'standard',
    worktree: ctx.dir,
    tempDir: ctx.dir,
    logger: ctx.logger,
  });

  expect(pass.findings.map((finding) => finding.title)).toStrictEqual([
    'Split the header line with the library parser',
  ]);

  expect([pass.record.status, pass.record.attempts]).toStrictEqual(['ok', 2]);
  expect(pass.failed).toBeNull();
});

test('it leaves out a data file, a file over the file limit and a file past the call limit, and reads the rest', async () => {
  const ctx = await setupTest();

  const stub = buildStubAdapter({ design: [{ findings: { design: [] } }] });

  await runDesignPass({
    title: 'Parse the header line',
    body: 'Parses the header line.',
    latest: [],
    earlier: [],
    files: [
      buildMockChangedFile({ path: 'src/a.ts' }),
      buildMockChangedFile({
        path: 'samples/headers.jsonl',
        oldPath: 'samples/headers.jsonl',
        hunks: [
          {
            oldStart: 1,
            oldLines: 0,
            newStart: 1,
            newLines: 1,
            lines: [{ kind: 'added', text: '{"header":"one"}', oldLine: null, newLine: 1 }],
          },
        ],
      }),
      buildMockChangedFile({
        path: 'src/big.ts',
        oldPath: 'src/big.ts',
        hunks: [
          {
            oldStart: 1,
            oldLines: 0,
            newStart: 1,
            newLines: 1,
            lines: [
              {
                kind: 'added',
                text: `export const big = '${'b'.repeat(36_000)}';`,
                oldLine: null,
                newLine: 1,
              },
            ],
          },
        ],
      }),
      buildMockChangedFile({
        path: 'src/c.ts',
        oldPath: 'src/c.ts',
        hunks: [
          {
            oldStart: 1,
            oldLines: 0,
            newStart: 1,
            newLines: 1,
            lines: [
              {
                kind: 'added',
                text: `export const c = '${'c'.repeat(34_000)}';`,
                oldLine: null,
                newLine: 1,
              },
            ],
          },
        ],
      }),
      buildMockChangedFile({
        path: 'src/d.ts',
        oldPath: 'src/d.ts',
        hunks: [
          {
            oldStart: 1,
            oldLines: 0,
            newStart: 1,
            newLines: 1,
            lines: [{ kind: 'added', text: 'export const d = 4;', oldLine: null, newLine: 1 }],
          },
        ],
      }),
    ],
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
    riskClasses: [],
    config: {
      ...BUILT_IN_DEFAULTS,
      data: ['samples/**'],
      thresholds: { ...BUILT_IN_DEFAULTS.thresholds, maxCallChars: 40_000, maxFileChars: 35_000 },
    },
    adapter: stub.adapter,
    callID: 'design',
    depth: 'standard',
    worktree: ctx.dir,
    tempDir: ctx.dir,
    logger: ctx.logger,
  });

  const prompt = stub.requests[0]?.prompt ?? '';

  expect(prompt).toInclude('### src/a.ts (modified)');
  expect(prompt).toInclude('### src/d.ts (modified)');
  expect(prompt).not.toInclude('{"header":"one"}');
  expect(prompt).not.toInclude(`'${'b'.repeat(1000)}`);
  expect(prompt).not.toInclude(`'${'c'.repeat(1000)}`);

  expect(prompt).toInclude(
    [
      '- `samples/headers.jsonl`: a data file the config names',
      '- `src/big.ts`: too large for one call',
      '- `src/c.ts`: too large for one call',
    ].join('\n'),
  );
});
