import { expect, test } from 'bun:test';
import { getLogger } from '@logtape/logtape';
import { buildCallOutputSchema } from '@noslop/contract';
import { buildStubAdapter } from '@noslop/testing';
import { buildConfiguredAdapter } from './build-configured-adapter';

test('it gives a call with no model or timeout of its own the ones the config sets', async () => {
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
      cwd: '.',
      timeoutMs: null,
    },
    { tempDir: '.', logger: getLogger(['test']) },
  );

  expect([
    adapter.defaultTimeoutMs,
    stub.requests[0]?.model,
    stub.requests[0]?.timeoutMs,
  ]).toStrictEqual([5000, 'large', 5000]);
});

test('it keeps the model and timeout a lens sets for its call', async () => {
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
      cwd: '.',
      timeoutMs: 100,
    },
    { tempDir: '.', logger: getLogger(['test']) },
  );

  expect([stub.requests[0]?.model, stub.requests[0]?.timeoutMs]).toStrictEqual(['small', 100]);
});
