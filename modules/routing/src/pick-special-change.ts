import type { SpecialChange } from '@noslop/contract';
import type { RouteInput } from './types';

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
