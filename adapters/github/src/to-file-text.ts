import type { GitHubFileRead } from './create-github-file-reader';

export function toFileText(read: GitHubFileRead): string | null {
  return read.kind === 'file' ? read.text : null;
}
