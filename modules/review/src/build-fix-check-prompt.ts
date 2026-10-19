export interface FixCheckPromptInput {
  title: string;
  lens: string;
  comment: string;
  path: string;
  code: string;
  diff: string;
}

// the prompt of one fix check, which reads the finding as posted, the code it anchored to and the
// diff of its file since then, and answers whether the diff fixes it; it raises no other defect
export function buildFixCheckPrompt(input: FixCheckPromptInput): string {
  return [
    'A reviewer posted the finding below on a pull request, and the author answered that a later commit fixes it.',
    'Judge from the finding, the code it anchored to and the diff alone whether the diff fixes the finding. Read no files.',
    '',
    '1. Answer `fixed: true` only when the diff removes the defect the finding describes.',
    '2. Answer `fixed: false` when the diff leaves the defect in place, moves it elsewhere, or changes other code.',
    '3. Give the reason in one line.',
    '4. Report no other defect, however the diff looks.',
    '',
    `## The finding: ${input.title}`,
    '',
    `Lens: ${input.lens}`,
    '',
    input.comment,
    '',
    `## The code at \`${input.path}\` before the fix`,
    '',
    '```text',
    input.code === '' ? '(the file is empty or absent at the reviewed head)' : input.code,
    '```',
    '',
    `## The diff of \`${input.path}\` since then`,
    '',
    '```diff',
    input.diff === '' ? '(no change to this file)' : input.diff,
    '```',
  ].join('\n');
}
