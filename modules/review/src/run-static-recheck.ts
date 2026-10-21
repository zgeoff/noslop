import type { Finding, ReviewConfig } from '@noslop/contract';
import { buildFindings } from '@noslop/findings';
import type { Runner } from '@noslop/runner';
import { readChange, runStaticStage } from '@noslop/static-stage';

// what the static stage reads beyond a fixes-only run's own input: the config, the pull request's
// linked issue and author, which some checks compare the change against, and the base index's cache
export interface StaticRecheckOptions {
  config: ReviewConfig;
  linkedIssue: string | null;
  cacheDir: string | null;
  author?: string;
}

export interface StaticRecheckInput extends StaticRecheckOptions {
  runner: Runner;
  repoDir: string;

  // the merge base of the pull request and its head now, so the stage reads the whole change
  mergeBase: string;
  head: string;
  title: string;
  body: string;
}

// the static findings a review of the whole pull request reports at its head; a check such as a new
// test with no assertion reads the change from the merge base, not the fix commit's
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

  // Assemble drops a finding off the diff and cuts a long title, as in the review that posted it
  const assembled = buildFindings({
    raw: stage.findings.map((finding) => ({ lens: 'static', callID: null, finding })),
    files: change.files,
    rules: [],
    riskClasses: stage.signals.riskClasses,
    config: input.config,
  });

  return assembled.findings;
}
