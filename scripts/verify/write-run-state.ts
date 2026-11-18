import { getRunStatePath } from './read-run-state.ts';
import type { RunState } from './read-run-state.ts';
import type { RunEndpoints } from './run-endpoints.ts';

export async function writeRunState(endpoints: RunEndpoints, state: RunState): Promise<void> {
  await Bun.write(getRunStatePath(endpoints), `${JSON.stringify(state)}\n`);
}
