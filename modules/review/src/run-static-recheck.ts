import type { ReviewConfig } from '@noslop/contract';
import { buildFindings } from '@noslop/findings';
import type { Runner } from '@noslop/runner';
import { readChange, runStaticStage } from '@noslop/static-stage';

// what the static stage reads beyond a fixes-only run's own input: the config, the pull request's
// body and linked issue, which some checks compare the change against, and the base index's cache
export interface StaticRecheckOptions {
  config: ReviewConfig;
  body: string;
  linkedIssue: string | null;
  cacheDir: string | null;
}

export interface StaticRecheckInput extends StaticRecheckOptions {
  runner: Runner;
  repoDir: string;

  // the merge base of the pull request and its head now, so the stage reads the whole change
  mergeBase: string;
  head: string;
  title: string;
}

// the IDs of the static findings a review of the whole pull request reports at its head; a check
// such as a new test with no assertion reads the change from the merge base, not the fix commit's
export async function runStaticRecheck(input: StaticRecheckInput): Promise<Set<string>> {
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
  });

  // Assemble numbers a defect found at a second place into its ID, as a review does, so each ID
  // matches the one the review posted
  const assembled = buildFindings({
    raw: stage.findings.map((finding) => ({ lens: 'static', callID: null, finding })),
    files: change.files,
    rules: [],
    riskClasses: stage.signals.riskClasses,
    config: input.config,
  });

  return new Set(assembled.findings.map((finding) => finding.id));
}
