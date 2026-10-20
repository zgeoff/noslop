import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getLogger } from '@logtape/logtape';
import { BUILT_IN_DEFAULTS } from '@noslop/config';
import { buildFindingID } from '@noslop/findings';
import { createRunner } from '@noslop/runner';
import { buildStubAdapter, createTestRepo } from '@noslop/testing';
import { runResolutionChecks } from './run-resolution-checks';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-resolution-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, runner: createRunner(), logger: getLogger(['test']) };
}

test('it passes a merge whose resolution keeps the change of each side', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: { 'src/options.ts': 'export const options = { retries: 1, timeoutMs: 1000 };\n' },
    },
    {
      message: 'Retry 3 times',
      files: { 'src/options.ts': 'export const options = { retries: 3, timeoutMs: 1000 };\n' },
    },
    {
      message: 'Wait longer',
      files: { 'src/options.ts': 'export const options = { retries: 1, timeoutMs: 5000 };\n' },
      parent: 0,
    },
    {
      message: 'Merge main',
      files: { 'src/options.ts': 'export const options = { retries: 3, timeoutMs: 5000 };\n' },
      parent: 1,
      merged: 2,
    },
  ]);

  const merge = repo.commits[3] ?? '';

  const stub = buildStubAdapter({
    [`resolution-${merge.slice(0, 12)}`]: [
      {
        sound: true,
        reason: 'The merge keeps 3 retries and the 5000 ms timeout.',
        findings: { correctness: [], security: [] },
      },
    ],
  });

  const run = await runResolutionChecks({
    runner: ctx.runner,
    repoDir: repo.path,
    base: repo.commits[1] ?? '',
    head: merge,
    config: BUILT_IN_DEFAULTS,
    dismissedFindings: [],
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  expect(run.checks).toStrictEqual([
    { merge, sound: true, reason: 'The merge keeps 3 retries and the 5000 ms timeout.' },
  ]);

  expect(run.findings).toStrictEqual([]);
  expect(run.failedCalls).toStrictEqual([]);
});

test('it gives the call only the diff from the tree git merge-tree builds to the merge, conflict markers included', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: { 'src/options.ts': 'export const options = { retries: 1, timeoutMs: 1000 };\n' },
    },
    {
      message: 'Retry 3 times',
      files: { 'src/options.ts': 'export const options = { retries: 3, timeoutMs: 1000 };\n' },
    },
    {
      message: 'Wait longer',
      files: {
        'src/options.ts': 'export const options = { retries: 1, timeoutMs: 5000 };\n',
        'src/limits.ts': 'export const maxPages = 40;\n',
      },
      parent: 0,
    },
    {
      message: 'Merge main',
      files: { 'src/options.ts': 'export const options = { retries: 3, timeoutMs: 5000 };\n' },
      parent: 1,
      merged: 2,
    },
  ]);

  const merge = repo.commits[3] ?? '';

  const stub = buildStubAdapter({
    [`resolution-${merge.slice(0, 12)}`]: [
      {
        sound: true,
        reason: 'The merge keeps 3 retries and the 5000 ms timeout.',
        findings: { correctness: [], security: [] },
      },
    ],
  });

  await runResolutionChecks({
    runner: ctx.runner,
    repoDir: repo.path,
    base: repo.commits[1] ?? '',
    head: merge,
    config: BUILT_IN_DEFAULTS,
    dismissedFindings: [],
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  const prompt = stub.requests[0]?.prompt ?? '';

  expect(prompt).toInclude('git could not merge these files: `src/options.ts`.');
  expect(prompt).toInclude(`       - <<<<<<< ${repo.commits[1] ?? ''}`);
  expect(prompt).toInclude(`       - >>>>>>> ${repo.commits[2] ?? ''}`);
  expect(prompt).toInclude('     1 + export const options = { retries: 3, timeoutMs: 5000 };');
  expect(prompt).not.toInclude('src/limits.ts');
});

test('it reports a resolution that drops the change of one side', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: { 'src/options.ts': 'export const options = { retries: 1, timeoutMs: 1000 };\n' },
    },
    {
      message: 'Retry 3 times',
      files: { 'src/options.ts': 'export const options = { retries: 3, timeoutMs: 1000 };\n' },
    },
    {
      message: 'Wait longer',
      files: { 'src/options.ts': 'export const options = { retries: 1, timeoutMs: 5000 };\n' },
      parent: 0,
    },
    {
      message: 'Merge main',
      files: { 'src/options.ts': 'export const options = { retries: 3, timeoutMs: 1000 };\n' },
      parent: 1,
      merged: 2,
    },
  ]);

  const merge = repo.commits[3] ?? '';
  const callID = `resolution-${merge.slice(0, 12)}`;

  const stub = buildStubAdapter({
    [callID]: [
      {
        sound: false,
        reason: 'The resolution drops the 5000 ms timeout the base branch set.',
        findings: {
          correctness: [
            {
              title: 'Keep the 5000 ms timeout from the base branch',
              body: 'The base branch raised the timeout to 5000 ms, and the resolution keeps 1000 ms, so slow requests fail again.',
              anchor: { path: 'src/options.ts', startLine: 1, endLine: 1 },
              secondLocation: null,
              severity: 'P1',
              criterion: 'wrong-result-main-path',
              rule: null,
              ruleQuote: null,
              verdict: 'CONFIRMED',
              unverifiedFact: null,
              missingChange: false,
              fix: 'Set timeoutMs to 5000.',
            },
          ],
          security: [],
        },
      },
    ],
  });

  const run = await runResolutionChecks({
    runner: ctx.runner,
    repoDir: repo.path,
    base: repo.commits[1] ?? '',
    head: merge,
    config: BUILT_IN_DEFAULTS,
    dismissedFindings: [],
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  expect(run.checks).toStrictEqual([
    {
      merge,
      sound: false,
      reason: 'The resolution drops the 5000 ms timeout the base branch set.',
    },
  ]);

  expect(run.findings).toStrictEqual([
    {
      id: buildFindingID(
        'correctness',
        'src/options.ts',
        'wrong-result-main-path',
        'Keep the 5000 ms timeout from the base branch',
      ),
      lens: 'correctness',
      callID,
      title: 'Keep the 5000 ms timeout from the base branch',
      body: 'The base branch raised the timeout to 5000 ms, and the resolution keeps 1000 ms, so slow requests fail again.',
      anchor: { path: 'src/options.ts', startLine: 1, endLine: 1 },
      severity: 'P1',
      criterion: 'wrong-result-main-path',
      verdict: 'CONFIRMED',
      writtenByChange: true,
      fix: 'Set timeoutMs to 5000.',
    },
  ]);
});

test('it judges a resolution not sound when it raises a finding, whatever the call answers', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: { 'src/options.ts': 'export const options = { retries: 1, timeoutMs: 1000 };\n' },
    },
    {
      message: 'Retry 3 times',
      files: { 'src/options.ts': 'export const options = { retries: 3, timeoutMs: 1000 };\n' },
    },
    {
      message: 'Wait longer',
      files: { 'src/options.ts': 'export const options = { retries: 1, timeoutMs: 5000 };\n' },
      parent: 0,
    },
    {
      message: 'Merge main',
      files: { 'src/options.ts': 'export const options = { retries: 3, timeoutMs: 1000 };\n' },
      parent: 1,
      merged: 2,
    },
  ]);

  const merge = repo.commits[3] ?? '';

  const stub = buildStubAdapter({
    [`resolution-${merge.slice(0, 12)}`]: [
      {
        sound: true,
        reason: 'The merge keeps both sides.',
        findings: {
          correctness: [
            {
              title: 'Keep the 5000 ms timeout from the base branch',
              body: 'The resolution keeps 1000 ms, so slow requests fail again.',
              anchor: { path: 'src/options.ts', startLine: 1, endLine: 1 },
              secondLocation: null,
              severity: 'P1',
              criterion: 'wrong-result-main-path',
              rule: null,
              ruleQuote: null,
              verdict: 'CONFIRMED',
              unverifiedFact: null,
              missingChange: false,
              fix: null,
            },
          ],
          security: [],
        },
      },
    ],
  });

  const run = await runResolutionChecks({
    runner: ctx.runner,
    repoDir: repo.path,
    base: repo.commits[1] ?? '',
    head: merge,
    config: BUILT_IN_DEFAULTS,
    dismissedFindings: [],
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  expect(run.checks).toStrictEqual([
    { merge, sound: false, reason: 'The merge keeps both sides.' },
  ]);
});

test('it makes no call for a merge whose tree equals the tree git merge-tree builds', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/options.ts': 'export const options = { retries: 1 };\n' } },
    {
      message: 'Retry 3 times',
      files: { 'src/options.ts': 'export const options = { retries: 3 };\n' },
    },
    {
      message: 'Cap the pages',
      files: { 'src/limits.ts': 'export const maxPages = 40;\n' },
      parent: 0,
    },
    { message: 'Merge main', files: {}, parent: 1, merged: 2 },
  ]);

  const stub = buildStubAdapter({});

  const run = await runResolutionChecks({
    runner: ctx.runner,
    repoDir: repo.path,
    base: repo.commits[1] ?? '',
    head: repo.commits[3] ?? '',
    config: BUILT_IN_DEFAULTS,
    dismissedFindings: [],
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  expect(run.checks).toStrictEqual([]);
  expect(stub.requests).toStrictEqual([]);
});

test('it checks a hand edit in a merge that git merged on its own', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/options.ts': 'export const options = { retries: 1 };\n' } },
    {
      message: 'Retry 3 times',
      files: { 'src/options.ts': 'export const options = { retries: 3 };\n' },
    },
    {
      message: 'Cap the pages',
      files: { 'src/limits.ts': 'export const maxPages = 40;\n' },
      parent: 0,
    },
    {
      message: 'Merge main',
      files: { 'src/limits.ts': 'export const maxPages = 80;\n' },
      parent: 1,
      merged: 2,
    },
  ]);

  const merge = repo.commits[3] ?? '';

  const stub = buildStubAdapter({
    [`resolution-${merge.slice(0, 12)}`]: [
      {
        sound: false,
        reason: 'The merge doubles the page cap the base branch set.',
        findings: { correctness: [], security: [] },
      },
    ],
  });

  const run = await runResolutionChecks({
    runner: ctx.runner,
    repoDir: repo.path,
    base: repo.commits[1] ?? '',
    head: merge,
    config: BUILT_IN_DEFAULTS,
    dismissedFindings: [],
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  expect(run.checks).toStrictEqual([
    { merge, sound: false, reason: 'The merge doubles the page cap the base branch set.' },
  ]);

  expect(stub.requests[0]?.prompt).toInclude(
    'git merged every file on its own, so each change is a hand edit.',
  );

  expect(stub.requests[0]?.prompt).toInclude('     1 + export const maxPages = 80;');
});

test('it drops a resolution finding that matches one answered not-a-defect', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: { 'src/options.ts': 'export const options = { retries: 1, timeoutMs: 1000 };\n' },
    },
    {
      message: 'Retry 3 times',
      files: { 'src/options.ts': 'export const options = { retries: 3, timeoutMs: 1000 };\n' },
    },
    {
      message: 'Wait longer',
      files: { 'src/options.ts': 'export const options = { retries: 1, timeoutMs: 5000 };\n' },
      parent: 0,
    },
    {
      message: 'Merge main',
      files: { 'src/options.ts': 'export const options = { retries: 3, timeoutMs: 5000 };\n' },
      parent: 1,
      merged: 2,
    },
  ]);

  const merge = repo.commits[3] ?? '';
  const callID = `resolution-${merge.slice(0, 12)}`;

  const stub = buildStubAdapter({
    [callID]: [
      {
        sound: false,
        reason: 'Three retries can stack past the timeout.',
        findings: {
          correctness: [
            {
              title: 'Bound the retries by the timeout',
              body: 'Three retries of 5000 ms each wait 15 seconds, past what a caller expects.',
              anchor: { path: 'src/options.ts', startLine: 1, endLine: 1 },
              secondLocation: null,
              severity: 'P2',
              criterion: 'wrong-behaviour-edge-path',
              rule: null,
              ruleQuote: null,
              verdict: 'CONFIRMED',
              unverifiedFact: null,
              missingChange: false,
              fix: null,
            },
          ],
          security: [],
        },
      },
    ],
  });

  const run = await runResolutionChecks({
    runner: ctx.runner,
    repoDir: repo.path,
    base: repo.commits[1] ?? '',
    head: merge,
    config: BUILT_IN_DEFAULTS,
    dismissedFindings: [
      {
        id: '2222222222222222',
        path: 'src/options.ts',
        criterion: 'wrong-behaviour-edge-path',
        rule: null,
        head: repo.commits[1] ?? '',
        startLine: 1,
        endLine: 1,
      },
    ],
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  expect(run.findings).toStrictEqual([]);

  expect(run.dropped).toStrictEqual([
    {
      lens: 'correctness',
      callID,
      title: 'Bound the retries by the timeout',
      anchor: { path: 'src/options.ts', startLine: 1, endLine: 1 },
      criterion: 'wrong-behaviour-edge-path',
      reason: 'answered-not-a-defect',
      rule: null,
      ruleQuote: null,
      answeredID: '2222222222222222',
    },
  ]);
});

test('it lists no verdict and records the failed call when the resolution call fails', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: { 'src/options.ts': 'export const options = { retries: 1, timeoutMs: 1000 };\n' },
    },
    {
      message: 'Retry 3 times',
      files: { 'src/options.ts': 'export const options = { retries: 3, timeoutMs: 1000 };\n' },
    },
    {
      message: 'Wait longer',
      files: { 'src/options.ts': 'export const options = { retries: 1, timeoutMs: 5000 };\n' },
      parent: 0,
    },
    {
      message: 'Merge main',
      files: { 'src/options.ts': 'export const options = { retries: 3, timeoutMs: 5000 };\n' },
      parent: 1,
      merged: 2,
    },
  ]);

  const merge = repo.commits[3] ?? '';
  const callID = `resolution-${merge.slice(0, 12)}`;
  const stub = buildStubAdapter({ [callID]: [{ error: 'the model timed out' }] });

  const run = await runResolutionChecks({
    runner: ctx.runner,
    repoDir: repo.path,
    base: repo.commits[1] ?? '',
    head: merge,
    config: BUILT_IN_DEFAULTS,
    dismissedFindings: [],
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  expect(run.checks).toStrictEqual([]);

  expect(run.failedCalls).toStrictEqual([
    { id: callID, lenses: ['correctness', 'security'], reason: 'the model timed out' },
  ]);
});
