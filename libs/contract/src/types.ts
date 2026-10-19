import type { Logger } from '@logtape/logtape';
import type { z } from 'zod';
import type { CallOutput } from './build-call-output-schema';
import type { Disposition } from './disposition';
import type { Effort } from './effort';
import type { Finding, FindingLens } from './finding';
import type { CallLens } from './lens-id';
import type { ReporterOptions } from './review-config';
import type { PullRequestRef, ReviewResult } from './review-result';
import type { Severity } from './severity';
import type { Tokens } from './tokens';

// a lens call returns findings keyed by lens; a pass with an output of its own, such as the merge
// pass, names its schema, and carries no lens
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

  // the verdicts of a fixes-only run, which ran no lens after the last review round: a reporter that
  // posts on the pull request posts no new finding, and counts a finding judged not fixed as reported
  // again
  fixesOnly?: { checks: readonly FixCheck[] };
}

// a fixes-only run's word on one `fixed` answer: whether the change since the last reviewed head fixes
// the finding, and the one-line reason
export interface FixCheck {
  findingID: string;
  fixed: boolean;
  reason: string;
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

// a finding that an earlier review of the pull request posted, as its comment keeps it, with the first
// line of the latest answer to it, so the design pass reads what each review raised and how the author
// answered
export interface EarlierFinding {
  id: string;
  lens: FindingLens;
  severity: Severity;
  title: string;
  path: string;
  answer: string | null;
}

export interface DispositionSource {
  id: string;
  readDispositions: (review: ReviewRef, ctx: ReporterContext) => Promise<Disposition[]>;
}

// one rules file, whole, named by its label; a rule from a reference holds the globs of the changed
// paths it applies to, and every other rule applies to any change
export interface Rule {
  name: string;
  body: string;
  paths: readonly string[] | null;
}
