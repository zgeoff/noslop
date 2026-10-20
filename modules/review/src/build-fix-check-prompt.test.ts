import { expect, test } from 'bun:test';
import { buildFixCheckPrompt } from './build-fix-check-prompt';

test("it asks whether the fix commit fixes the finding from the finding, its code, the commit's patch and the diff alone", () => {
  expect(
    buildFixCheckPrompt({
      title: 'Reject an empty separator',
      lens: 'correctness',
      comment: 'An empty separator splits the line into single characters.',
      path: 'src/scan.ts',
      code: '1: export const separator = "";',
      commit: 'abcdef0123456789abcdef0123456789abcdef01',
      patch: '-export const separator = "";\n+export const separator = ":";',
      diff: '-export const separator = "";\n+export const separator = ":";',
    }),
  ).toMatchInlineSnapshot(`
    "A reviewer posted the finding below on a pull request, and the author answered that a later commit fixes it.
    Judge from the finding, the code it anchored to, the fix commit's patch and the diff since then whether the fix commit fixes the finding. Read no files.

    1. Answer \`fixed: true\` only when the fix commit's patch removes the defect the finding describes. The fix may be in another file, such as a new test that the finding asks for.
    2. Answer \`fixed: false\` when the patch leaves the defect in place, moves it elsewhere, or changes only code the finding does not describe, or when the diff since then puts the defect back.
    3. A later commit may move the code or the test of the fix to a file the diff since then leaves out. Count a line of the fix that the diff since then deletes as moved, not undone, unless that diff puts the defect back.
    4. Give the reason in one line.
    5. Report no other defect, however the patch or the diff looks.

    ## The finding: Reject an empty separator

    Lens: correctness

    An empty separator splits the line into single characters.

    ## The code at \`src/scan.ts\` before the fix

    \`\`\`text
    1: export const separator = "";
    \`\`\`

    ## The patch of the fix commit \`abcdef012345\`

    \`\`\`diff
    -export const separator = "";
    +export const separator = ":";
    \`\`\`

    ## The diff since then of \`src/scan.ts\` and of each file the fix commit changes

    \`\`\`diff
    -export const separator = "";
    +export const separator = ":";
    \`\`\`"
  `);
});

test('it names an empty patch, an empty diff and absent code, so the call reads no blank block', () => {
  const prompt = buildFixCheckPrompt({
    title: 'Reject an empty separator',
    lens: 'correctness',
    comment: '',
    path: 'src/scan.ts',
    code: '',
    commit: 'abcdef0123456789abcdef0123456789abcdef01',
    patch: '',
    diff: '',
  });

  expect(prompt).toInclude('(the file is empty or absent at the reviewed head)');
  expect(prompt).toInclude('(the commit changes no file)');
  expect(prompt).toInclude('(no change to these files)');
});
