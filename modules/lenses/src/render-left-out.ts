import type { NotReviewedFile } from '@noslop/contract';
import { formatPathCode } from '@noslop/contract';

export interface LeftOutFile {
  path: string;
  reason: NotReviewedFile['reason'] | 'other-part';
}

const LEFT_OUT_REASONS: Readonly<Record<LeftOutFile['reason'], string>> = {
  data: 'a data file the config names',
  'too-large': 'too large for one call',
  'other-part': 'read by another call of this review',
};

export function renderLeftOut(files: readonly LeftOutFile[]): string {
  return [
    '## Files left out',
    'The change holds these files, but this input leaves out their hunks and slices. Report no finding on what they hold, and no finding that their change is missing.',
    files
      .map((file) => `- ${formatPathCode(file.path)}: ${LEFT_OUT_REASONS[file.reason]}`)
      .join('\n'),
  ].join('\n\n');
}
