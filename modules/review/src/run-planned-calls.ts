import type { Logger } from '@logtape/logtape';
import type {
  CallRecord,
  CallResult,
  Depth,
  FailedCall,
  ReviewAdapter,
  Slices,
} from '@noslop/contract';
import { buildCallOutputSchema } from '@noslop/contract';
import type { RawFinding } from '@noslop/findings';
import type { CallPromptInput } from '@noslop/lenses';
import { buildCallPrompt } from '@noslop/lenses';
import type { PlannedCall } from '@noslop/routing';

export interface CallBatchInput {
  calls: readonly PlannedCall[];
  depth: Depth;
  adapter: ReviewAdapter;
  worktree: string;
  tempDir: string;
  logger: Logger;
  slices: Slices;
  rules: CallPromptInput['rules'];
  title: string;
  body: string;
  linkedIssue: string | null;

  // the base and head commits that every line reference cites
  base: string;
  head: string;

  // a closing instruction for each call, given the call; null for a first review
  task: ((call: PlannedCall) => string | null) | null;
}

export interface CallBatch {
  records: CallRecord[];
  failed: FailedCall[];
  raw: RawFinding[];
}

const ATTEMPTS = 2;

// runs each planned call on the adapter, one after another, and retries a failed call once on the
// same adapter; a call that fails twice is recorded as failed, and the batch goes on
export async function runPlannedCalls(input: CallBatchInput): Promise<CallBatch> {
  const batch: CallBatch = { records: [], failed: [], raw: [] };

  for (const call of input.calls) {
    const prompt = buildCallPrompt({
      lenses: call.lenses,
      files: call.files,
      slices: input.slices,
      rules: input.rules,
      title: input.title,
      body: input.body,
      linkedIssue: input.linkedIssue,
      base: input.base,
      head: input.head,
      task: input.task === null ? null : input.task(call),
    });

    const outcome = await runWithRetry(call, prompt, input);

    const chunk = /#(?<chunk>\d+)$/u.exec(call.callID)?.groups?.['chunk'];

    const record: CallRecord = {
      id: call.callID,
      lenses: call.lenses,
      depth: input.depth,
      adapter: input.adapter.id,
      model: outcome.result?.model ?? call.model,
      effort: call.effort,
      chunk: chunk === undefined ? null : Number(chunk),
      status: outcome.result === null ? 'failed' : 'ok',
      attempts: outcome.attempts,
      tokens: outcome.result?.tokens ?? { input: 0, output: 0 },
      durationMs: Math.round(outcome.durationMs),
    };

    batch.records.push(record);

    if (outcome.result === null) {
      batch.failed.push({ id: call.callID, lenses: call.lenses, reason: outcome.reason });
      continue;
    }

    for (const lens of call.lenses) {
      for (const finding of outcome.result.output.findings[lens] ?? []) {
        batch.raw.push({ lens, callID: call.callID, finding });
      }
    }
  }

  return batch;
}

interface CallOutcome {
  result: CallResult | null;
  attempts: number;
  durationMs: number;
  reason: string;
}

async function runWithRetry(
  call: PlannedCall,
  prompt: string,
  input: CallBatchInput,
): Promise<CallOutcome> {
  const started = performance.now();
  let reason = '';

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const result = await tryRunCall(call, prompt, input);

    if (result instanceof Error) {
      reason = result.message;

      input.logger.warn('call {callID} failed on attempt {attempt}: {reason}', {
        callID: call.callID,
        attempt,
        reason,
      });
    } else {
      return { result, attempts: attempt, durationMs: performance.now() - started, reason: '' };
    }
  }

  return { result: null, attempts: ATTEMPTS, durationMs: performance.now() - started, reason };
}

async function tryRunCall(
  call: PlannedCall,
  prompt: string,
  input: CallBatchInput,
): Promise<CallResult | Error> {
  try {
    return await input.adapter.runCall(
      {
        callID: call.callID,
        lenses: call.lenses,
        prompt,
        outputSchema: buildCallOutputSchema(call.lenses),
        effort: call.effort,
        model: call.model,
        cwd: input.worktree,
        timeoutMs: call.timeoutMs,
      },
      { tempDir: input.tempDir, logger: input.logger },
    );
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}
