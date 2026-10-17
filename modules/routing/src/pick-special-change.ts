import type { SpecialChange } from '@noslop/contract';
import type { RouteInput } from './types';

// a change that routes on its own lens list: a sync from a source repo, a release bump, a change of
// prose alone, or a direct push; a sync wins over a release, and a release over docs only, so each
// change gets the narrowest route that covers it
export function pickSpecialChange(input: RouteInput): SpecialChange | null {
  const files = input.change.files;

  if (input.isSync) {
    return 'sync';
  }

  if (input.isRelease) {
    return 'release';
  }

  if (
    files.length > 0 &&
    files.every((file) => file.kind === 'prose' || file.kind === 'instructions')
  ) {
    return 'docs-only';
  }

  return input.isPush ? 'direct-push' : null;
}
