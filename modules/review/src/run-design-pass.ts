import type { Logger } from '@logtape/logtape';
import type {
  CallRecord,
  ChangedFile,
  Depth,
  EarlierFinding,
  Finding,
  ReviewAdapter,
  ReviewConfig,
} from '@noslop/contract';
import { buildCallOutputSchema } from '@noslop/contract';
import type { AssembledFindings } from '@noslop/findings';
import { buildFindings } from '@noslop/findings';
import type { LeftOutFile } from '@noslop/lenses';
import { buildDesignPrompt, renderHunks } from '@noslop/lenses';

export interface DesignPassInput {
  title: string;
  body: string;
  latest: readonly Finding[];
  earlier: readonly EarlierFinding[];

  // the files of the whole pull request since its merge base, and the commits it runs between
  files: readonly ChangedFile[];
  base: string;
  head: string;
  riskClasses: readonly string[];
  config: ReviewConfig;
  adapter: ReviewAdapter;
  callID: string;
  depth: Depth;

  // the worktree of the head, which the model reads to check the approach it proposes
  worktree: string;
  tempDir: string;
  logger: Logger;
}

export interface DesignPass {
  findings: Finding[];
  dropped: AssembledFindings['dropped'];
  record: CallRecord;
}

// the most findings the design pass reports, since it judges one approach: the pull request's
const MAX_DESIGN_FINDINGS = 1;

// one call after the merge pass that asks whether a better approach meets the task the pull request
// states; Assemble checks its finding against the whole pull request, and a failed pass adds no
// finding and fails no review, since the other lenses still covered the head
export async function runDesignPass(input: DesignPassInput): Promise<DesignPass> {
  const started = performance.now();

  const record: CallRecord = {
    id: input.callID,
    lenses: ['design'],
    depth: input.depth,
    adapter: input.adapter.id,
    model: null,
    effort: input.config.designPass.effort,
    status: 'ok',
    attempts: 1,
    tokens: { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 },
    durationMs: 0,
  };

  try {
    const result = await input.adapter.runCall(
      {
        callID: input.callID,
        lenses: ['design'],
        prompt: buildDesignPrompt({ ...input, ...planDesignFiles(input) }),
        outputSchema: buildCallOutputSchema(['design']),
        effort: input.config.designPass.effort,
        model: null,
        cwd: input.worktree,
        timeoutMs: null,
      },
      { tempDir: input.tempDir, logger: input.logger },
    );

    const assembled = buildFindings({
      raw: (result.output.findings.design ?? []).map((finding) => ({
        lens: 'design' as const,
        callID: input.callID,
        finding,
      })),
      files: input.files,
      rules: [],
      riskClasses: input.riskClasses,
      config: input.config,
    });

    return {
      findings: assembled.findings.slice(0, MAX_DESIGN_FINDINGS),
      dropped: assembled.dropped,
      record: {
        ...record,
        model: result.model,
        tokens: result.tokens,
        durationMs: Math.round(performance.now() - started),
      },
    };
  } catch (error) {
    input.logger.warn('the design pass failed, so the review reports no design finding: {reason}', {
      reason: error instanceof Error ? error.message : String(error),
    });

    return {
      findings: [],
      dropped: [],
      record: { ...record, status: 'failed', durationMs: Math.round(performance.now() - started) },
    };
  }
}

// the files whose hunks the prompt holds, in the change's order, until the next one would pass the
// call limit; a data file and a file over the file limit stay out, and the prompt lists each file it
// leaves out
function planDesignFiles(input: DesignPassInput): {
  files: ChangedFile[];
  leftOut: LeftOutFile[];
} {
  const thresholds = input.config.thresholds;
  const globs = input.config.data.map((glob) => new Bun.Glob(glob));
  const files: ChangedFile[] = [];
  const leftOut: LeftOutFile[] = [];
  let size = buildDesignPrompt({ ...input, files: [], leftOut: [] }).length;

  for (const file of input.files) {
    if (globs.some((glob) => glob.match(file.path))) {
      leftOut.push({ path: file.path, reason: 'data' });
      continue;
    }

    const hunks = renderHunks([file]).length;

    if (hunks > thresholds.maxFileChars || size + hunks > thresholds.maxCallChars) {
      leftOut.push({ path: file.path, reason: 'too-large' });
      continue;
    }

    files.push(file);

    size += hunks;
  }

  return { files, leftOut };
}
