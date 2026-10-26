import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getLogger } from '@logtape/logtape';
import { buildCallOutputSchema } from '@noslop/contract';
import { buildStubAdapter } from '@noslop/testing';
import { buildConfiguredAdapter } from './build-configured-adapter';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-configured-adapter-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it gives a call with no model or timeout of its own the ones the config sets', async () => {
  const ctx = await setupTest();

  const stub = buildStubAdapter({ correctness: [{ findings: { correctness: [] } }] });
  const adapter = buildConfiguredAdapter(stub.adapter, { model: 'large', timeoutMs: 5000 });

  await adapter.runCall(
    {
      callID: 'correctness',
      lenses: ['correctness'],
      prompt: 'Review the change.',
      outputSchema: buildCallOutputSchema(['correctness']),
      effort: 'medium',
      model: null,
      cwd: ctx.directory,
      timeoutMs: null,
    },
    { tempDir: ctx.directory, logger: getLogger(['test']) },
  );

  expect(adapter.defaultTimeoutMs).toBe(5000);
  expect(stub.requests[0]?.model).toBe('large');
  expect(stub.requests[0]?.timeoutMs).toBe(5000);
});

test('it keeps the model and timeout a lens sets for its call', async () => {
  const ctx = await setupTest();

  const stub = buildStubAdapter({ correctness: [{ findings: { correctness: [] } }] });
  const adapter = buildConfiguredAdapter(stub.adapter, { model: 'large', timeoutMs: 5000 });

  await adapter.runCall(
    {
      callID: 'correctness',
      lenses: ['correctness'],
      prompt: 'Review the change.',
      outputSchema: buildCallOutputSchema(['correctness']),
      effort: 'medium',
      model: 'small',
      cwd: ctx.directory,
      timeoutMs: 100,
    },
    { tempDir: ctx.directory, logger: getLogger(['test']) },
  );

  expect(stub.requests[0]?.model).toBe('small');
  expect(stub.requests[0]?.timeoutMs).toBe(100);
});
