export interface FixCheckPromptInput {
  title: string;
  lens: string;
  comment: string;
  path: string;
  code: string;
  isTraced: boolean;

  // the pull request's net diff, from its merge base to the head, or only the finding file's part of it
  // when the whole diff passes the file limit
  diff: string;
  isWholeDiff: boolean;
}

export function buildFixCheckPrompt(input: FixCheckPromptInput): string {
  return [
    'A reviewer posted the finding below on a pull request, and the author answered that the pull request fixes it.',
    "Judge from the finding, its code at the pull request's head and the pull request's diff whether the head still holds the defect. Read no files.",
    '',
    '1. Answer `fixed: true` only when the code at the head no longer holds the defect the finding describes. The fix may be in another file, such as a new test that the finding asks for.',
    '2. Answer `fixed: false` when the head still holds the defect, or the diff moves the defect elsewhere.',
    '3. The pull request may move the code or the test of a fix to another file and reshape it there. Count code or a test that the diff deletes as moved when the diff adds code or a test in another file that does what the deleted lines did, in other lines or not.',
    '4. Give the reason in one line.',
    '5. Report no other defect, however the code or the diff looks.',
    '',
    `## The finding: ${input.title}`,
    '',
    `Lens: ${input.lens}`,
    '',
    input.comment,
    '',
    input.isTraced
      ? `## The code at \`${input.path}\` at the head, around the finding's lines`
      : `## The whole file \`${input.path}\` at the head, since the finding's lines could not be traced there`,
    '',
    '```text',
    input.code === '' ? '(the file is empty or absent at the head)' : input.code,
    '```',
    '',
    input.isWholeDiff
      ? "## The pull request's diff"
      : `## The pull request's diff of \`${input.path}\` alone, since its whole diff is too large to read`,
    '',
    '```diff',
    input.diff === '' ? formatEmptyDiff(input.isWholeDiff) : input.diff,
    '```',
  ].join('\n');
}

function formatEmptyDiff(isWholeDiff: boolean): string {
  return isWholeDiff
    ? '(the pull request changes no file)'
    : '(the pull request leaves this file alone)';
}
