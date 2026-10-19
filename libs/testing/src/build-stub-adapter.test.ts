import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getLogger } from '@logtape/logtape';
import { buildCallOutputSchema } from '@noslop/contract';
import { buildStubAdapter } from './build-stub-adapter';

test('it answers each attempt of a call with the next answer under its ID', async () => {
  const stub = buildStubAdapter({
    correctness: [{ error: 'codex timed out' }, { findings: { correctness: [] } }],
  });

  const request = {
    callID: 'correctness',
    lenses: ['correctness'] as const,
    prompt: 'Review the change.',
    outputSchema: buildCallOutputSchema(['correctness']),
    effort: 'medium' as const,
    model: null,
    cwd: 'missing-worktree',
    timeoutMs: null,
  };

  const context = { tempDir: '.', logger: getLogger(['test']) };

  const first = await stub.adapter.runCall(request, context).catch((error: unknown) => error);
  const second = await stub.adapter.runCall(request, context);

  expect(first).toStrictEqual(new Error('codex timed out'));
  expect(second.output).toStrictEqual({ findings: { correctness: [] } });
  expect(stub.requests.map((item) => item.callID)).toStrictEqual(['correctness', 'correctness']);
});

test('it holds a delayed call, so a later call answers first', async () => {
  const stub = buildStubAdapter(
    {
      correctness: [{ findings: { correctness: [] } }],
      security: [{ findings: { correctness: [] } }],
    },
    { correctness: 30 },
  );

  const request = {
    lenses: ['correctness'] as const,
    prompt: 'Review the change.',
    outputSchema: buildCallOutputSchema(['correctness']),
    effort: 'medium' as const,
    model: null,
    cwd: 'missing-worktree',
    timeoutMs: null,
  };

  const context = { tempDir: '.', logger: getLogger(['test']) };

  await Promise.all([
    stub.adapter.runCall({ ...request, callID: 'correctness' }, context),
    stub.adapter.runCall({ ...request, callID: 'security' }, context),
  ]);

  expect(stub.ended).toStrictEqual(['security', 'correctness']);
});

test('it rejects a call that has no answer left', () => {
  const stub = buildStubAdapter({});

  expect(
    stub.adapter.runCall(
      {
        callID: 'security',
        lenses: ['security'],
        prompt: 'Review the change.',
        outputSchema: buildCallOutputSchema(['security']),
        effort: 'high',
        model: null,
        cwd: 'missing-worktree',
        timeoutMs: null,
      },
      { tempDir: '.', logger: getLogger(['test']) },
    ),
  ).rejects.toThrowWithMessage(Error, 'the stub adapter has no answer 1 for call security');
});

test('it records the files of the working directory that each call saw, outside git', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-stub-adapter-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  await Bun.write(join(directory, 'src', 'a.ts'), '');
  await Bun.write(join(directory, 'README.md'), '');
  await Bun.write(join(directory, '.git'), 'gitdir: elsewhere\n');

  const stub = buildStubAdapter({ correctness: [{ findings: { correctness: [] } }] });

  await stub.adapter.runCall(
    {
      callID: 'correctness',
      lenses: ['correctness'],
      prompt: 'Review the change.',
      outputSchema: buildCallOutputSchema(['correctness']),
      effort: 'low',
      model: null,
      cwd: directory,
      timeoutMs: null,
    },
    { tempDir: directory, logger: getLogger(['test']) },
  );

  expect(stub.seenFiles).toStrictEqual([['README.md', join('src', 'a.ts')]]);
});
