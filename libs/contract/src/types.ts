import type { Logger } from '@logtape/logtape';
import type { z } from 'zod';
import type { Effort } from './config/effort';
import type { CallLens } from './config/lens-id';
import type { ReporterOptions } from './config/review-config';
import type { CallOutput } from './findings/build-call-output-schema';
import type { Criterion } from './findings/criterion';
import type { Disposition } from './findings/disposition';
import type { Finding } from './findings/finding';
import type { PullRequestRef, ReviewResult } from './result/review-result';
import type { Tokens } from './result/tokens';

export interface CallRequest<Output = CallOutput> {
  callID: string;
  lenses: readonly CallLens[];
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

export interface ReviewAdapter {
  id: string;
  defaultTimeoutMs: number;
  efforts: Readonly<Record<Effort, string>>;
  runCall: <Output>(call: CallRequest<Output>, ctx: AdapterContext) => Promise<CallResult<Output>>;
}

export interface ReporterContext {
  logger: Logger;
  options: ReporterOptions;
}

export interface Reporter {
  id: string;

  runsLast?: boolean;
  report: (result: ReviewResult, ctx: ReporterContext) => Promise<void>;
}

export interface ReviewRef {
  pullRequest: PullRequestRef;
  head: string;
  findings: readonly Finding[];
}

export interface DismissedFinding {
  id: string;
  path: string;
  criterion: Criterion | null;
  rule: string | null;

  head: string | null;
  startLine: number | null;
  endLine: number | null;
}

export interface DispositionSource {
  id: string;
  readDispositions: (review: ReviewRef, ctx: ReporterContext) => Promise<Disposition[]>;
}

export interface Rule {
  name: string;
  body: string;
  paths: readonly string[] | null;
}
