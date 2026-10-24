import type { Finding, ReviewConfig } from '@noslop/contract';
import { buildFindings } from '@noslop/findings';
import type { Runner } from '@noslop/runner';
import { readChange, runStaticStage } from '@noslop/static-stage';

export interface StaticRecheckOptions {
  config: ReviewConfig;
  linkedIssue: string | null;
  cacheDir: string | null;
  author?: string;
}

export interface StaticRecheckInput extends StaticRecheckOptions {
  runner: Runner;
  repoDir: string;

  mergeBase: string;
  head: string;
  title: string;
  body: string;
}

export async function runStaticRecheck(input: StaticRecheckInput): Promise<Finding[]> {
  const change = await readChange({
    runner: input.runner,
    repoDir: input.repoDir,
    base: input.mergeBase,
    head: input.head,
    config: input.config,
  });

  const stage = await runStaticStage({
    runner: input.runner,
    repoDir: input.repoDir,
    change,
    config: input.config,
    title: input.title,
    body: input.body,
    linkedIssue: input.linkedIssue,
    cacheDir: input.cacheDir,
    pastEscapes: [],
    ...(input.author === undefined ? {} : { author: input.author }),
  });

  const assembled = buildFindings({
    raw: stage.findings.map((finding) => ({ lens: 'static', callID: null, finding })),
    files: change.files,
    rules: [],
    riskClasses: stage.signals.riskClasses,
    config: input.config,
  });

  return assembled.findings;
}
