import type { Change } from '@noslop/contract';
import type { Route, RouteInput } from '@noslop/routing';
import { buildRoute } from '@noslop/routing';
import type { StaticStageResult } from '@noslop/static-stage';
import { readChange, runStaticStage } from '@noslop/static-stage';
import type { RunReviewOptions } from './run-review';

export type PlanReviewOptions = Pick<
  RunReviewOptions,
  | 'runner'
  | 'repoDir'
  | 'base'
  | 'head'
  | 'config'
  | 'cacheDir'
  | 'title'
  | 'body'
  | 'linkedIssue'
  | 'isPush'
  | 'pastEscapes'
  | 'readConsumerFile'
>;

export interface ReviewPlan {
  change: Change;
  stage: StaticStageResult;
  routeInput: RouteInput;
  route: Route;
}

// the part of a review that needs no model: the change, the static stage and the route, so the depth
// and the planned calls of a change can be read without running a call
export async function planReview(options: PlanReviewOptions): Promise<ReviewPlan> {
  const change = await readChange({
    runner: options.runner,
    repoDir: options.repoDir,
    base: options.base,
    head: options.head,
    config: options.config,
  });

  const stage = await runStaticStage({
    runner: options.runner,
    repoDir: options.repoDir,
    change,
    config: options.config,
    title: options.title,
    body: options.body,
    linkedIssue: options.linkedIssue,
    cacheDir: options.cacheDir,
    pastEscapes: options.pastEscapes,
    ...(options.readConsumerFile === undefined
      ? {}
      : { readConsumerFile: options.readConsumerFile }),
  });

  const routeInput: RouteInput = {
    change,
    slices: stage.slices,
    signals: stage.signals,
    config: options.config,
    linkedIssue: options.linkedIssue,
    isSync: stage.isSync,
    isRelease: stage.isRelease,
    isPush: options.isPush,
  };

  return { change, stage, routeInput, route: buildRoute(routeInput) };
}
