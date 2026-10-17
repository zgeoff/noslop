import type { SpecialChange } from '@noslop/contract';
import type { ChangedFile } from '@noslop/static-stage';
import type { RouteInput } from './types';

const CHANGELOG = /(?:^|\/)CHANGELOG(?:\.[a-z]+)?$/iu;
const VERSION_LINE = /^\s*"version"\s*:\s*"[^"]*"\s*,?\s*$/u;

// a change that routes on its own lens list: a sync from a source repo, a release bump, a change of
// prose alone, or a direct push; a sync wins over a release, and a release over docs only, so each
// change gets the narrowest route that covers it
export function pickSpecialChange(input: RouteInput): SpecialChange | null {
  const files = input.change.files;

  if (input.isSync) {
    return 'sync';
  }

  if (files.length > 0 && files.every((file) => isReleaseFile(file))) {
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

// a release bump touches only changelogs and the version field of package manifests
function isReleaseFile(file: ChangedFile): boolean {
  if (CHANGELOG.test(file.path)) {
    return true;
  }

  if (!file.path.endsWith('package.json')) {
    return false;
  }

  return file.hunks.every((hunk) =>
    hunk.lines.every((line) => line.kind === 'context' || VERSION_LINE.test(line.text)),
  );
}
