import type { Logger } from '@logtape/logtape';
import type {
  CallRecord,
  CallResult,
  Depth,
  FailedCall,
  NotReviewedFile,
  ReviewAdapter,
  Slices,
} from '@noslop/contract';
import { buildCallOutputSchema } from '@noslop/contract';
import type { RawFinding } from '@noslop/findings';
import type { CallPromptInput } from '@noslop/lenses';
import type { PlannedCall } from '@noslop/routing';
import { runConcurrently } from '@noslop/runner';
import { planCallBatch } from './plan-call-batch';

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
  isIncremental: boolean;

  // how many calls run at once
  parallel: number;

  // the config's data globs and the size limits that split a call into parts
  data: readonly string[];
  maxCallChars: number;
  maxFileChars: number;
}

export interface CallBatch {
  records: CallRecord[];
  failed: FailedCall[];
  raw: RawFinding[];

  // each changed file that no call read, once
  notReviewed: NotReviewedFile[];
}

const ATTEMPTS = 2;

// runs the planned calls, each as parts that fit the prompt limit, up to the parallel limit at once;
// a failed call retries once, a call that fails twice is recorded as failed, and the records keep the
// planned order whatever order the calls end in
export async function runPlannedCalls(input: CallBatchInput): Promise<CallBatch> {
  const plan = planCallBatch(input);
  const parts = plan.parts;
  const batch: CallBatch = { records: [], failed: [], raw: [], notReviewed: plan.notReviewed };

  const outcomes = await runConcurrently(parts, input.parallel, async (part) => {
    const outcome = await runWithRetry(part.call, part.prompt, input);

    return { call: part.call, outcome };
  });

  for (const ran of outcomes) {
    const call = ran.call;
    const outcome = ran.outcome;

    const record: CallRecord = {
      id: call.callID,
      lenses: call.lenses,
      depth: input.depth,
      adapter: input.adapter.id,
      model: outcome.result?.model ?? call.model,
      effort: call.effort,
      status: outcome.result === null ? 'failed' : 'ok',
      attempts: outcome.attempts,
      tokens: outcome.result?.tokens ?? { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 },
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
