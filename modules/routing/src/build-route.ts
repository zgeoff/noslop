import { pickDepth } from './pick-depth';
import { pickLenses } from './pick-lenses';
import { pickSpecialChange } from './pick-special-change';
import { planCalls } from './plan-calls';
import type { Route, RouteInput } from './types';

// routes a change from the static stage's output alone: the special route, the lenses, the depth and
// the calls, so 2 runs on one change route it the same way
export function buildRoute(input: RouteInput): Route {
  const special = pickSpecialChange(input);
  const lenses = pickLenses(input, special);
  const depth = pickDepth(input);

  return { special, lenses, depth, calls: planCalls(input, lenses, depth) };
}
