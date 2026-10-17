import type { Logger } from '@logtape/logtape';
import type { z } from 'zod';
import type { CallOutput } from './build-call-output-schema';
import type { Disposition } from './disposition';
import type { Effort } from './effort';
import type { Finding } from './finding';
import type { LensID } from './lens-id';
import type { ReporterOptions } from './review-config';
import type { PullRequestRef, ReviewResult } from './review-result';
import type { Tokens } from './tokens';

// a lens call returns findings keyed by lens; a pass with an output of its own, such as the merge
// pass, names its schema, and carries no lens
export interface CallRequest<Output = CallOutput> {
  callID: string;
  lenses: readonly LensID[];
  prompt: string;
  outputSchema: z.ZodType<Output>;
  effort: Effort;
  model: string | null;
  cwd: string;
  timeoutMs: number | null;
}

export interface CallResult<Output = CallOutput> {
  output: Output;
  model: string | null;
  tokens: Tokens;
  durationMs: number;
  exitCode: number;
}

export interface AdapterContext {
  tempDir: string;
  logger: Logger;
}

// runs one call on one model CLI, configured read-only in the adapter's own code; output that fails
// the schema rejects, so a call never returns a partial result
export interface ReviewAdapter {
  id: string;
  defaultTimeoutMs: number;
  efforts: Readonly<Record<Effort, string>>;
  runCall: <Output>(call: CallRequest<Output>, ctx: AdapterContext) => Promise<CallResult<Output>>;
}

export interface ReporterContext {
  logger: Logger;
  options: ReporterOptions;

  // the reporters that ran before this one and failed; a reporter that runs last reads it
  failedReporters: readonly string[];
}

export interface Reporter {
  id: string;

  // a reporter that gates on the others, such as the one that sets a check run, runs after them all
  runsLast?: boolean;
  report: (result: ReviewResult, ctx: ReporterContext) => Promise<void>;
}

export interface ReviewRef {
  pullRequest: PullRequestRef;
  head: string;
  findings: readonly Finding[];
}

export interface DispositionSource {
  id: string;
  readDispositions: (review: ReviewRef, ctx: ReporterContext) => Promise<Disposition[]>;
}
