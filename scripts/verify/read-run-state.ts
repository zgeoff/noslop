import { join } from 'node:path';
import { z } from 'zod';
import type { RunEndpoints } from './run-endpoints.ts';

export const adapterSchema = z.enum(['claude', 'codex']);

export type Adapter = z.infer<typeof adapterSchema>;

// A run opens one pull request at a time: `opened` after open-pull-request, `fixed` after
// push-fix, and `closed` after close-pull-request, when the run may open the next one.
const runStateSchema = z.discriminatedUnion('stage', [
  z.strictObject({
    stage: z.literal('opened'),
    pullRequest: z.int().positive(),
    adapter: adapterSchema,
  }),
  z.strictObject({
    stage: z.literal('fixed'),
    pullRequest: z.int().positive(),
    adapter: adapterSchema,
    fixSha: z.string().regex(/^[0-9a-f]{40}$/u),
  }),
  z.strictObject({ stage: z.literal('closed') }),
]);

export type RunState = z.infer<typeof runStateSchema>;

export type OpenRunState = Extract<RunState, { stage: 'opened' | 'fixed' }>;

// Returns null before the run's first open-pull-request.
export async function readRunState(endpoints: RunEndpoints): Promise<RunState | null> {
  const file = Bun.file(getRunStatePath(endpoints));

  if (!(await file.exists())) {
    return null;
  }

  const state: unknown = await file.json();

  return runStateSchema.parse(state);
}

export function getRunStatePath(endpoints: RunEndpoints): string {
  return join(endpoints.root, 'state.json');
}
