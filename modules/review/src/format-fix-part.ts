import { match } from 'ts-pattern';

// one piece of what a fix call reads beside the finding's code when the answer names its fix commit
export interface FixPart {
  kind: 'commit-diff' | 'head-file' | 'absent-file' | 'net-diff';

  // the file the part shows, or null for the pull request's net diff
  path: string | null;
  text: string;
}

// the block a fix call reads for a part, or the line that names it among the parts left out to fit
// the call
export function formatFixPart(part: FixPart, isLeftOut: boolean): string {
  const name = match(part.kind)
    .with('commit-diff', () => `The fix commit's diff of \`${part.path}\``)
    .with('head-file', () => `The whole file \`${part.path}\` at the head`)
    .with('absent-file', () => `The file \`${part.path}\`, which the head does not hold`)
    .with('net-diff', () => "The pull request's net diff")
    .exhaustive();

  if (isLeftOut) {
    return `- ${name}`;
  }

  if (part.kind === 'absent-file') {
    return `### ${name}\n\nA commit removed this file, so the head holds none of its code.`;
  }

  const fence = part.kind === 'head-file' ? 'text' : 'diff';
  const text = part.text === '' ? '(empty)' : part.text;

  return [`### ${name}`, '', `\`\`\`${fence}`, text, '```'].join('\n');
}
