import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getLogger } from '@logtape/logtape';
import { buildMockReviewResult } from '@noslop/testing';
import { createJSONReporter } from './create-json-reporter';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-json-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it writes the result to the file its options name', async () => {
  const ctx = await setupTest();

  const written: string[] = [];

  const reporter = createJSONReporter((text) => {
    written.push(text);
  });

  await reporter.report(buildMockReviewResult(), {
    logger: getLogger(['test']),
    options: { path: join(ctx.directory, 'result.json') },
    failedReporters: [],
  });

  const saved: unknown = await Bun.file(join(ctx.directory, 'result.json')).json();

  expect([saved, written]).toStrictEqual([buildMockReviewResult(), []]);
});

test('it writes the result through the writer when its options name no file', async () => {
  const written: string[] = [];

  const reporter = createJSONReporter((text) => {
    written.push(text);
  });

  await reporter.report(buildMockReviewResult(), {
    logger: getLogger(['test']),
    options: {},
    failedReporters: [],
  });

  expect(written).toStrictEqual([`${JSON.stringify(buildMockReviewResult(), null, 2)}\n`]);
});
