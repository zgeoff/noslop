import { expect, test } from 'bun:test';
import { buildFixCheckPrompt } from './build-fix-check-prompt';

test("it asks whether the head still holds the defect from the finding, its code at the head and the pull request's diff alone", () => {
  expect(
    buildFixCheckPrompt({
      title: 'Reject an empty separator',
      lens: 'correctness',
      comment: 'An empty separator splits the line into single characters.',
      path: 'src/scan.ts',
      code: '1: export const separator = ":";',
      isTraced: true,
      diff: '-export const separator = "";\n+export const separator = ":";',
      isWholeDiff: true,
    }),
  ).toMatchInlineSnapshot(`
    "A reviewer posted the finding below on a pull request, and the author answered that the pull request fixes it.
    Judge from the finding, its code at the pull request's head and the pull request's diff whether the head still holds the defect. Read no files.

    1. Answer \`fixed: true\` only when the code at the head no longer holds the defect the finding describes. The fix may be in another file, such as a new test that the finding asks for.
    2. Answer \`fixed: false\` when the head still holds the defect, or the diff moves the defect elsewhere.
    3. The pull request may move the code or the test of a fix to another file and reshape it there. Count code or a test that the diff deletes as moved when the diff adds code or a test in another file that does what the deleted lines did, in other lines or not.
    4. Give the reason in one line.
    5. Report no other defect, however the code or the diff looks.

    ## The finding: Reject an empty separator

    Lens: correctness

    An empty separator splits the line into single characters.

    ## The code at \`src/scan.ts\` at the head, around the finding's lines

    \`\`\`text
    1: export const separator = ":";
    \`\`\`

    ## The pull request's diff

    \`\`\`diff
    -export const separator = "";
    +export const separator = ":";
    \`\`\`"
  `);
});

test('it names the whole file when the trace failed', () => {
  const prompt = buildFixCheckPrompt({
    title: 'Reject an empty separator',
    lens: 'correctness',
    comment: '',
    path: 'src/scan.ts',
    code: '1: export const separator = ":";',
    isTraced: false,
    diff: '+export const separator = ":";',
    isWholeDiff: true,
  });

  expect(prompt).toInclude(
    "## The whole file `src/scan.ts` at the head, since the finding's lines could not be traced there",
  );
});

test('it names an empty diff and absent code, so the call reads no blank block', () => {
  const prompt = buildFixCheckPrompt({
    title: 'Reject an empty separator',
    lens: 'correctness',
    comment: '',
    path: 'src/scan.ts',
    code: '',
    isTraced: false,
    diff: '',
    isWholeDiff: true,
  });

  expect(prompt).toInclude('(the file is empty or absent at the head)');
  expect(prompt).toInclude('(the pull request changes no file)');
});

test("it names the finding file's diff alone when the whole diff is too large to read", () => {
  const prompt = buildFixCheckPrompt({
    title: 'Reject an empty separator',
    lens: 'correctness',
    comment: '',
    path: 'src/scan.ts',
    code: '1: export const separator = ":";',
    isTraced: true,
    diff: '',
    isWholeDiff: false,
  });

  expect(prompt).toInclude(
    "## The pull request's diff of `src/scan.ts` alone, since its whole diff is too large to read",
  );

  expect(prompt).toInclude('(the pull request leaves this file alone)');
});
