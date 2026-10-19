import type { Logger } from '@logtape/logtape';
import type {
  CallRecord,
  CallRequest,
  CallResult,
  ChangedFile,
  Depth,
  EarlierFinding,
  FailedCall,
  Finding,
  ReviewAdapter,
  ReviewConfig,
} from '@noslop/contract';
import { buildCallOutputSchema } from '@noslop/contract';
import type { AssembledFindings } from '@noslop/findings';
import { buildFindings } from '@noslop/findings';
import { buildDesignPrompt } from '@noslop/lenses';

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

  // the worktree of the head, which the model reads to check the approach it proposes, and to read
  // the diff itself when the hunks pass the call limit
  worktree: string;
  tempDir: string;
  logger: Logger;
}

export interface DesignPass {
  findings: Finding[];
  dropped: AssembledFindings['dropped'];
  record: CallRecord;
  failed: FailedCall | null;
}

// the most findings the design pass reports, since it judges one approach: the pull request's
const MAX_DESIGN_FINDINGS = 1;

// a failed attempt is retried once, as a lens call is
const ATTEMPTS = 2;

// one call after the merge pass that asks whether a better approach meets the task the pull request
// states; Assemble checks its finding against the whole pull request; a pass that fails twice is a
// failed call of the review, as a lens call is, so the review confirms no fix, a design fix included
export async function runDesignPass(input: DesignPassInput): Promise<DesignPass> {
  const started = performance.now();

  const request: CallRequest = {
    callID: input.callID,
    lenses: ['design'],
    prompt: planDesignPrompt(input),
    outputSchema: buildCallOutputSchema(['design']),
    effort: input.config.designPass.effort,
    model: null,
    cwd: input.worktree,
    timeoutMs: null,
  };

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

  let reason = '';

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const result = await tryRunCall(input, request);

    if (result instanceof Error) {
      reason = result.message;

      input.logger.warn('the design pass failed on attempt {attempt}: {reason}', {
        attempt,
        reason,
      });

      continue;
    }

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
        attempts: attempt,
        tokens: result.tokens,
        durationMs: Math.round(performance.now() - started),
      },
      failed: null,
    };
  }

  return {
    findings: [],
    dropped: [],
    record: {
      ...record,
      status: 'failed',
      attempts: ATTEMPTS,
      durationMs: Math.round(performance.now() - started),
    },
    failed: { id: input.callID, lenses: ['design'], reason },
  };
}

// the prompt with the hunks of every file but the data files, which no call reads; when that whole
// prompt passes the call limit, the prompt lists the files instead and the model reads their diff in
// the worktree, so the design call leaves out no part of the pull request it judges
function planDesignPrompt(input: DesignPassInput): string {
  const globs = input.config.data.map((glob) => new Bun.Glob(glob));
  const isData = (file: ChangedFile) => globs.some((glob) => glob.match(file.path));

  const shared = {
    ...input,
    files: input.files.filter((file) => !isData(file)),
    leftOut: input.files
      .filter((file) => isData(file))
      .map((file) => ({ path: file.path, reason: 'data' as const })),
  };

  const inline = buildDesignPrompt({ ...shared, isDiffListed: false });

  return inline.length <= input.config.thresholds.maxCallChars
    ? inline
    : buildDesignPrompt({ ...shared, isDiffListed: true });
}

async function tryRunCall(
  input: DesignPassInput,
  request: CallRequest,
): Promise<CallResult | Error> {
  try {
    return await input.adapter.runCall(request, { tempDir: input.tempDir, logger: input.logger });
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}
