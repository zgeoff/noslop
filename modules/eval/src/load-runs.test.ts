import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRuns } from './load-runs';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'noslop-runs-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it reads a recorded run of case reviews', async () => {
  const ctx = await setupTest();

  const runs = [
    {
      caseID: 'case-1',
      review: {
        findings: [
          {
            lens: null,
            title: 'Wrap the warning',
            severity: 'P2' as const,
            anchor: { path: 'src/a.ts', startLine: 4, endLine: 6 },
          },
        ],
        failed: false,
        tokens: { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 },
        durationMs: 1200,
        calls: 1,
        depth: null,
      },
    },
  ];

  await Bun.write(join(ctx.dir, 'run.json'), JSON.stringify(runs));

  const loaded = await loadRuns(join(ctx.dir, 'run.json'));

  expect(loaded).toStrictEqual(runs);
});

test('it reads no cache counts from a run recorded before them', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.dir, 'run.json'),
    JSON.stringify([
      {
        caseID: 'case-1',
        review: {
          findings: [],
          failed: false,
          tokens: { input: 9000, output: 300 },
          durationMs: 1200,
          calls: 2,
          depth: 'standard',
        },
      },
    ]),
  );

  const loaded = await loadRuns(join(ctx.dir, 'run.json'));

  expect(loaded[0]?.review.tokens).toStrictEqual({
    input: 9000,
    cachedInput: 0,
    cacheWrite: 0,
    output: 300,
  });
});

test('it rejects a run whose finding has no anchor', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.dir, 'run.json'),
    JSON.stringify([
      {
        caseID: 'case-1',
        review: {
          findings: [{ lens: null, title: 'Wrap the warning', severity: 'P2' }],
          failed: false,
          tokens: { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 },
          durationMs: 1200,
          calls: 1,
          depth: null,
        },
      },
    ]),
  );

  expect(loadRuns(join(ctx.dir, 'run.json'))).rejects.toMatchObject({
    issues: [{ path: [0, 'review', 'findings', 0, 'anchor'] }],
  });
});
