export interface FixCheckPromptInput {
  title: string;
  lens: string;
  comment: string;
  path: string;
  code: string;

  // the fix commit's full sha and its whole patch
  commit: string;
  patch: string;
  diff: string;
}

// the prompt of one fix check, which reads the finding as posted, the code it anchored to, the fix
// commit's whole patch and the diff from the fix commit to the head, and answers whether the fix
// commit fixes it and the fix holds at the head; it raises no other defect
export function buildFixCheckPrompt(input: FixCheckPromptInput): string {
  return [
    'A reviewer posted the finding below on a pull request, and the author answered that a later commit fixes it.',
    "Judge from the finding, the code it anchored to, the fix commit's patch and the diff from the fix commit to the head whether the fix commit fixes the finding and the fix holds at the head. Read no files.",
    '',
    "1. Answer `fixed: true` only when the fix commit's patch removes the defect the finding describes and the fix holds at the head. The fix may be in another file, such as a new test that the finding asks for.",
    '2. Answer `fixed: false` when the patch leaves the defect in place, moves it elsewhere, or changes only code the finding does not describe, or when the diff from the fix commit to the head undoes the fix.',
    '3. A later commit may move the code or the test of the fix to another file. Count a line of the fix that the diff from the fix commit to the head deletes as moved only when that diff adds the same line in another file. Otherwise count the fix undone.',
    '4. Give the reason in one line.',
    '5. Report no other defect, however the patch or the diff looks.',
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
    `## The patch of the fix commit \`${input.commit.slice(0, 12)}\``,
    '',
    '```diff',
    input.patch === '' ? '(the commit changes no file)' : input.patch,
    '```',
    '',
    '## The diff from the fix commit to the head',
    '',
    '```diff',
    input.diff === '' ? '(no commit after the fix commit)' : input.diff,
    '```',
  ].join('\n');
}
