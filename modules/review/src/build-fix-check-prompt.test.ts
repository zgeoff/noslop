import { expect, test } from 'bun:test';
import { buildFixCheckPrompt } from './build-fix-check-prompt';

test("it asks whether the pull request still holds the defect from the finding, its code at the head, the pull request's diff and its description alone", () => {
  expect(
    buildFixCheckPrompt({
      title: 'Reject an empty separator',
      lens: 'correctness',
      comment: 'An empty separator splits the line into single characters.',
      path: 'src/scan.ts',
      code: '1: export const separator = ":";',
      isTraced: true,
      evidence: {
        kind: 'pull-request',
        diff: '-export const separator = "";\n+export const separator = ":";',
        isWholeDiff: true,
      },
      pullRequestTitle: 'Scan the header line',
      body: 'Splits each header line on a colon.',
    }),
  ).toMatchInlineSnapshot(`
    "A reviewer posted the finding below on a pull request, and the author answered that the pull request fixes it.
    Judge from the finding, its code at the pull request's head, the pull request's diff and its description now whether the pull request still holds the defect. Read no files.

    1. Answer \`fixed: true\` only when the code at the head and the description no longer hold the defect the finding describes. The fix may be in another file, such as a new test that the finding asks for. The fix of a finding about the title or the body is an edit to the description, which the diff never shows.
    2. Answer \`fixed: false\` when the code or the description still holds the defect, or the diff moves the defect elsewhere.
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
    \`\`\`

    ## The pull request's description now

    Title: Scan the header line

    Splits each header line on a colon."
  `);
});

test('it asks from the parts of the fix commit the author named, and names the parts left out', () => {
  expect(
    buildFixCheckPrompt({
      title: 'Reject an empty separator',
      lens: 'correctness',
      comment: 'An empty separator splits the line into single characters.',
      path: 'src/scan.ts',
      code: "2: export const scan = (line: string) => splitHeader(line, '');",
      isTraced: true,
      evidence: {
        kind: 'fix-commit',
        commit: 'abc1234',
        parts: [
          {
            kind: 'commit-diff',
            path: 'src/split.ts',
            text: "+  if (separator === '') {\n+    throw new Error('empty separator');\n+  }",
          },
          {
            kind: 'head-file',
            path: 'src/split.ts',
            text: "export function splitHeader(line: string, separator: string) {\n  if (separator === '') {\n    throw new Error('empty separator');\n  }\n  return line.split(separator);\n}",
          },
        ],
        leftOut: [{ kind: 'net-diff', path: null, text: '+name: value' }],
      },
      pullRequestTitle: 'Scan the header line',
      body: '',
    }),
  ).toMatchInlineSnapshot(`
    "A reviewer posted the finding below on a pull request, and the author answered that the pull request fixes it.
    Judge from the finding, its code at the pull request's head, the fix commit the author named, the files that commit touched and the pull request's description now whether the pull request still holds the defect. Read no files.

    1. Answer \`fixed: true\` only when the code at the head and the description no longer hold the defect the finding describes. The fix may be in another file, such as a new test that the finding asks for. The fix of a finding about the title or the body is an edit to the description, which the diff never shows.
    2. Answer \`fixed: false\` when the code or the description still holds the defect, or the diff moves the defect elsewhere.
    3. The pull request may move the code or the test of a fix to another file and reshape it there. Count code or a test that the diff deletes as moved when the diff adds code or a test in another file that does what the deleted lines did, in other lines or not.
    4. Give the reason in one line.
    5. Report no other defect, however the code or the diff looks.
    6. The fix commit may fix the defect in a helper that the finding's code calls, or in a file that replaces the finding's file, so judge the defect where the code at the head does that work now. A commit that changes no code the defect runs through leaves it unfixed.
    7. A part left out to fit the call is unread, so its absence shows nothing about the fix.

    ## The finding: Reject an empty separator

    Lens: correctness

    An empty separator splits the line into single characters.

    ## The code at \`src/scan.ts\` at the head, around the finding's lines

    \`\`\`text
    2: export const scan = (line: string) => splitHeader(line, '');
    \`\`\`

    ## The fix commit \`abc1234\`

    The author named this commit as the fix. The parts below show what it changed, the files it touched as they stand at the head, and the pull request's net diff.

    ### The fix commit's diff of \`src/split.ts\`

    \`\`\`diff
    +  if (separator === '') {
    +    throw new Error('empty separator');
    +  }
    \`\`\`

    ### The whole file \`src/split.ts\` at the head

    \`\`\`text
    export function splitHeader(line: string, separator: string) {
      if (separator === '') {
        throw new Error('empty separator');
      }
      return line.split(separator);
    }
    \`\`\`

    ## Left out to fit the call

    - The pull request's net diff

    ## The pull request's description now

    Title: Scan the header line

    The body is empty."
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
    evidence: { kind: 'pull-request', diff: '+export const separator = ":";', isWholeDiff: true },
    pullRequestTitle: 'Scan the header line',
    body: '',
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
    evidence: { kind: 'pull-request', diff: '', isWholeDiff: true },
    pullRequestTitle: 'Scan the header line',
    body: '',
  });

  expect(prompt).toInclude('(the file is empty or absent at the head)');
  expect(prompt).toInclude('(the pull request changes no file)');

  expect(prompt).toEndWith(
    "## The pull request's description now\n\nTitle: Scan the header line\n\nThe body is empty.",
  );
});

test("it names the finding file's diff alone when the whole diff is too large to read", () => {
  const prompt = buildFixCheckPrompt({
    title: 'Reject an empty separator',
    lens: 'correctness',
    comment: '',
    path: 'src/scan.ts',
    code: '1: export const separator = ":";',
    isTraced: true,
    evidence: { kind: 'pull-request', diff: '', isWholeDiff: false },
    pullRequestTitle: 'Scan the header line',
    body: '',
  });

  expect(prompt).toInclude(
    "## The pull request's diff of `src/scan.ts` alone, since its whole diff is too large to read",
  );

  expect(prompt).toInclude('(the pull request leaves this file alone)');
});
