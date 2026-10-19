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

test('it gives the hunks of every file but a data file when they fit the call limit', async () => {
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
    ],
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
    riskClasses: [],
    config: { ...BUILT_IN_DEFAULTS, data: ['samples/**'] },
    adapter: stub.adapter,
    callID: 'design',
    depth: 'standard',
    worktree: ctx.dir,
    tempDir: ctx.dir,
    logger: ctx.logger,
  });

  const prompt = stub.requests[0]?.prompt ?? '';

  expect(prompt).toInclude('### src/a.ts (modified)');
  expect(prompt).toInclude('- `samples/headers.jsonl`: a data file the config names');
  expect(prompt).not.toInclude('{"header":"one"}');
  expect(prompt).not.toInclude('.noslop-design-hunks.md');
});

test('it writes the hunks of every file but a data file to a file in the worktree when they pass the call limit', async () => {
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
      thresholds: { ...BUILT_IN_DEFAULTS.thresholds, maxCallChars: 40_000 },
    },
    adapter: stub.adapter,
    callID: 'design',
    depth: 'standard',
    worktree: ctx.dir,
    tempDir: ctx.dir,
    logger: ctx.logger,
  });

  const prompt = stub.requests[0]?.prompt ?? '';

  const hunks = await Bun.file(join(ctx.dir, '.noslop-design-hunks.md')).text();

  expect(stub.seenFiles).toStrictEqual([['.noslop-design-hunks.md']]);
  expect(prompt).toInclude('the file `.noslop-design-hunks.md` in your working directory');

  expect(prompt).toInclude(
    ['- `src/a.ts`', '- `src/big.ts`', '- `src/c.ts`', '- `src/d.ts`'].join('\n'),
  );

  expect(prompt).toInclude('- `samples/headers.jsonl`: a data file the config names');
  expect(prompt).not.toInclude('### src/');
  expect(prompt).not.toInclude(`'${'c'.repeat(1000)}`);
  expect(prompt.length).toBeLessThanOrEqual(40_000);
  expect(hunks).toInclude('### src/a.ts (modified)');
  expect(hunks).toInclude('### src/d.ts (modified)');
  expect(hunks).toInclude(`export const c = '${'c'.repeat(34_000)}';`);
  expect(hunks).not.toInclude('{"header":"one"}');
});
