import type { Logger } from '@logtape/logtape';
import type { z } from 'zod';
import type { CallOutput } from './build-call-output-schema';
import type { Criterion } from './criterion';
import type { Disposition } from './disposition';
import type { Effort } from './effort';
import type { Finding } from './finding';
import type { CallLens } from './lens-id';
import type { ReporterOptions } from './review-config';
import type { PullRequestRef, ReviewResult } from './review-result';
import type { Tokens } from './tokens';

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

  failedReporters: readonly string[];
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
