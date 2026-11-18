import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getLogger } from '@logtape/logtape';
import { buildMockReviewResult } from '@noslop/contract/test-utils/build-mock-review-result';
import { readTempPrefix } from '@noslop/runner';
import { createJSONReporter } from './create-json-reporter';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), `${readTempPrefix()}noslop-json-`));

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
  });

  expect(written).toStrictEqual([`${JSON.stringify(buildMockReviewResult(), null, 2)}\n`]);
});
