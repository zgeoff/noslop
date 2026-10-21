export interface FixCheckPromptInput {
  title: string;
  lens: string;
  comment: string;
  path: string;
  code: string;
  commit: string;
  patch: string;
  diff: string;
}

export function buildFixCheckPrompt(input: FixCheckPromptInput): string {
  return [
    'A reviewer posted the finding below on a pull request, and the author answered that a later commit fixes it.',
    "Judge from the finding, the code it anchored to, the fix commit's patch and the diff from the fix commit to the head whether the fix commit fixes the finding and the fix holds at the head. Read no files.",
    '',
    "1. Answer `fixed: true` only when the fix commit's patch removes the defect the finding describes, or moves an earlier commit's fix of it, and the fix holds at the head. The fix may be in another file, such as a new test that the finding asks for.",
    '2. Answer `fixed: false` when the patch leaves the defect in place, moves the defect elsewhere, or changes only code the finding does not describe, or when the diff from the fix commit to the head undoes the fix.',
    '3. The fix commit, or a later commit, may move the code or the test of a fix to another file and reshape it there. Count code or a test that the patch or the diff deletes as moved when the same patch or diff adds code or a test in another file that does what the deleted lines did, in other lines or not. Count the fix undone when nothing it adds does that.',
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
