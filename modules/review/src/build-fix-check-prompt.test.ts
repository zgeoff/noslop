import { expect, test } from 'bun:test';
import { buildFixCheckPrompt } from './build-fix-check-prompt';

test('it asks whether the diff fixes the finding from the finding, its code and the diff alone', () => {
  expect(
    buildFixCheckPrompt({
      title: 'Reject an empty separator',
      lens: 'correctness',
      comment: 'An empty separator splits the line into single characters.',
      path: 'src/scan.ts',
      code: '1: export const separator = "";',
      diff: '-export const separator = "";\n+export const separator = ":";',
    }),
  ).toMatchInlineSnapshot(`
    "A reviewer posted the finding below on a pull request, and the author answered that a later commit fixes it.
    Judge from the finding, the code it anchored to and the diff alone whether the diff fixes the finding. Read no files.

    1. Answer \`fixed: true\` only when the diff removes the defect the finding describes.
    2. Answer \`fixed: false\` when the diff leaves the defect in place, moves it elsewhere, or changes other code.
    3. Give the reason in one line.
    4. Report no other defect, however the diff looks.

    ## The finding: Reject an empty separator

    Lens: correctness

    An empty separator splits the line into single characters.

    ## The code at \`src/scan.ts\` before the fix

    \`\`\`text
    1: export const separator = "";
    \`\`\`

    ## The diff of \`src/scan.ts\` since then

    \`\`\`diff
    -export const separator = "";
    +export const separator = ":";
    \`\`\`"
  `);
});

test('it names an empty diff and absent code, so the call reads no blank block', () => {
  const prompt = buildFixCheckPrompt({
    title: 'Reject an empty separator',
    lens: 'correctness',
    comment: '',
    path: 'src/scan.ts',
    code: '',
    diff: '',
  });

  expect(prompt).toInclude('(the file is empty or absent at the reviewed head)');
  expect(prompt).toInclude('(no change to this file)');
});
