import { WringerError } from '@wringer/core';
import { readRunState } from './read-run-state.ts';
import type { OpenRunState } from './read-run-state.ts';
import type { RunEndpoints } from './run-endpoints.ts';

export async function readOpenRunState(endpoints: RunEndpoints): Promise<OpenRunState> {
  const state = await readRunState(endpoints);

  if (state === null || state.stage === 'closed') {
    throw new WringerError('check-failed', {
      message: 'the run has no open pull request',
      hint: 'Run `bun verify action open-pull-request` first.',
    });
  }

  return state;
}
