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
  | 'mergeBase'
  | 'paths'
  | 'config'
  | 'cacheDir'
  | 'title'
  | 'body'
  | 'linkedIssue'
  | 'isPush'
  | 'pastEscapes'
  | 'readConsumerFile'
  | 'author'
  | 'depth'
>;

export interface ReviewPlan {
  change: Change;
  stage: StaticStageResult;
  routeInput: RouteInput;
  route: Route;

  maxCalls: number;
}

export async function planReview(options: PlanReviewOptions): Promise<ReviewPlan> {
  const change = await readChange({
    runner: options.runner,
    repoDir: options.repoDir,
    base: options.base,
    head: options.head,
    config: options.config,
    ...(options.mergeBase === undefined ? {} : { mergeBase: options.mergeBase }),
    ...(options.paths === undefined ? {} : { paths: options.paths }),
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
    ...(options.author === undefined ? {} : { author: options.author }),
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

  const route = buildRoute(routeInput, options.depth ?? null);

  return { change, stage, routeInput, route, maxCalls: countMaxCalls(route, options) };
}

function countMaxCalls(route: Route, options: PlanReviewOptions): number {
  if (route.calls.length === 0) {
    return 0;
  }

  return route.calls.length + (options.config.mergePass.enabled ? 1 : 0);
}
