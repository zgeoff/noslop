import type { Depth } from '@noslop/contract';
import { pickDepth } from './pick-depth';
import { pickLenses } from './pick-lenses';
import { pickSpecialChange } from './pick-special-change';
import { planCalls } from './plan-calls';
import type { Route, RouteInput } from './types';

export function buildRoute(input: RouteInput, forcedDepth: Depth | null = null): Route {
  const special = pickSpecialChange(input);
  const lenses = pickLenses(input, special);
  const depth = forcedDepth ?? pickDepth(input);

  return { special, lenses, depth, calls: planCalls(input, lenses, depth) };
}
