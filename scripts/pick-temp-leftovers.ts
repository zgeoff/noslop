import { collectTempLeftovers } from './collect-temp-leftovers';

export function pickTempLeftovers(
  names: readonly string[],
  namespace: string,
  running: ReadonlyMap<number, boolean>,
): string[] {
  return collectTempLeftovers(names, namespace)
    .filter((leftover) => running.get(leftover.pid) === false)
    .map((leftover) => leftover.name);
}
