import type { Logger } from '@logtape/logtape';
import type {
  CallRecord,
  Depth,
  Finding,
  LensID,
  ReviewAdapter,
  ReviewConfig,
} from '@noslop/contract';
import { z } from 'zod';
import { buildMergePrompt } from './build-merge-prompt';
import { mergeGroupedFindings } from './merge-grouped-findings';

export interface MergePassInput {
  findings: readonly Finding[];
  config: ReviewConfig;
  adapter: ReviewAdapter;
  model: string | null;
  callID: string;
  depth: Depth;

  // the lenses of the review in route order, which the call's record lists
  lenses: readonly LensID[];
  tempDir: string;
  logger: Logger;
}

export interface MergePass {
  findings: Finding[];
  record: CallRecord | null;
}

const groupSchema = z.array(z.string());
const mergeOutputSchema = z.strictObject({ groups: z.array(groupSchema) });

// one call that groups the findings which report one defect, after Assemble's own merge; it runs on
// a review with 2 or more model findings, reads no code, and keeps the findings as they are when it
// fails, since a repeat costs the reader less than a lost finding
export async function runMergePass(input: MergePassInput): Promise<MergePass> {
  const modelFindings = input.findings.filter((finding) => finding.lens !== 'static');

  const reported = new Set<string>(modelFindings.map((finding) => finding.lens));

  const lenses = input.lenses.filter((lens) => reported.has(lens));

  if (!input.config.mergePass.enabled || modelFindings.length < 2) {
    return { findings: [...input.findings], record: null };
  }

  const started = performance.now();

  const record: CallRecord = {
    id: input.callID,
    lenses,
    depth: input.depth,
    adapter: input.adapter.id,
    model: input.model,
    effort: input.config.mergePass.effort,
    status: 'ok',
    attempts: 1,
    tokens: { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 },
    durationMs: 0,
  };

  try {
    const result = await input.adapter.runCall(
      {
        callID: input.callID,
        lenses,
        prompt: buildMergePrompt(input.findings),
        outputSchema: mergeOutputSchema,
        effort: input.config.mergePass.effort,
        model: input.model,
        cwd: input.tempDir,
        timeoutMs: null,
      },
      { tempDir: input.tempDir, logger: input.logger },
    );

    return {
      findings: mergeGroupedFindings(input.findings, result.output.groups),
      record: {
        ...record,
        model: result.model ?? input.model,
        tokens: result.tokens,
        durationMs: Math.round(performance.now() - started),
      },
    };
  } catch (error) {
    input.logger.warn('the merge pass failed, so the findings stay unmerged: {reason}', {
      reason: error instanceof Error ? error.message : String(error),
    });

    return {
      findings: [...input.findings],
      record: { ...record, status: 'failed', durationMs: Math.round(performance.now() - started) },
    };
  }
}
