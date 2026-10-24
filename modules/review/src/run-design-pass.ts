import { mkdtemp } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { Logger } from '@logtape/logtape';
import type {
  CallRecord,
  CallRequest,
  CallResult,
  ChangedFile,
  Depth,
  FailedCall,
  Finding,
  ReviewAdapter,
  ReviewConfig,
} from '@noslop/contract';
import { buildCallOutputSchema } from '@noslop/contract';
import type { AssembledFindings } from '@noslop/findings';
import { buildFindings } from '@noslop/findings';
import { buildDesignPrompt, renderHunks } from '@noslop/lenses';

export interface DesignPassInput {
  title: string;
  body: string;
  findings: readonly Finding[];

  files: readonly ChangedFile[];
  base: string;
  head: string;
  riskClasses: readonly string[];
  config: ReviewConfig;
  adapter: ReviewAdapter;
  callID: string;
  depth: Depth;

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

const MAX_DESIGN_FINDINGS = 1;
const ATTEMPTS = 2;

export async function runDesignPass(input: DesignPassInput): Promise<DesignPass> {
  const started = performance.now();

  const request: CallRequest = {
    callID: input.callID,
    lenses: ['design'],
    prompt: await writeDesignPrompt(input),
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

async function writeDesignPrompt(input: DesignPassInput): Promise<string> {
  const globs = input.config.data.map((glob) => new Bun.Glob(glob));
  const isData = (file: ChangedFile) => globs.some((glob) => glob.match(file.path));
  const files = input.files.filter((file) => !isData(file));

  const shared = {
    ...input,
    files,
    leftOut: input.files
      .filter((file) => isData(file))
      .map((file) => ({ path: file.path, reason: 'data' as const })),
  };

  const inline = buildDesignPrompt({ ...shared, hunksFile: null });

  if (inline.length <= input.config.thresholds.maxCallChars) {
    return inline;
  }

  // mkdtemp adds a random suffix, so the folder's name matches no checked-out path and the hunks
  // file never replaces a file of the repo
  const directory = await mkdtemp(join(input.worktree, '.noslop-design-'));

  const hunksFile = join(relative(input.worktree, directory), 'hunks.md');

  await Bun.write(join(input.worktree, hunksFile), `${renderHunks(files)}\n`);

  return buildDesignPrompt({ ...shared, hunksFile });
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
