import { match } from 'ts-pattern';
import type { FixPart } from './format-fix-part';
import { formatFixPart } from './format-fix-part';

// what a fix call reads beside the finding's code: the pull request's net diff, or only the finding
// file's part of it when the whole diff passes the file limit; or, for an answer that names a fix
// commit the pull request holds, the parts that commit touched
export type FixEvidence =
  | { kind: 'pull-request'; diff: string; isWholeDiff: boolean }
  | { kind: 'fix-commit'; commit: string; parts: readonly FixPart[]; leftOut: readonly FixPart[] };

export interface FixCheckPromptInput {
  title: string;
  lens: string;
  comment: string;
  path: string;
  code: string;
  isTraced: boolean;
  evidence: FixEvidence;
  pullRequestTitle: string;
  body: string;
}

export function buildFixCheckPrompt(input: FixCheckPromptInput): string {
  const isFixCommit = input.evidence.kind === 'fix-commit';

  return [
    'A reviewer posted the finding below on a pull request, and the author answered that the pull request fixes it.',
    isFixCommit
      ? "Judge from the finding, its code at the pull request's head, the fix commit the author named, the files that commit touched and the pull request's description now whether the pull request still holds the defect. Read no files."
      : "Judge from the finding, its code at the pull request's head, the pull request's diff and its description now whether the pull request still holds the defect. Read no files.",
    '',
    '1. Answer `fixed: true` only when the code at the head and the description no longer hold the defect the finding describes. The fix may be in another file, such as a new test that the finding asks for. The fix of a finding about the title or the body is an edit to the description, which the diff never shows.',
    '2. Answer `fixed: false` when the code or the description still holds the defect, or the diff moves the defect elsewhere.',
    '3. The pull request may move the code or the test of a fix to another file and reshape it there. Count code or a test that the diff deletes as moved when the diff adds code or a test in another file that does what the deleted lines did, in other lines or not.',
    '4. Give the reason in one line.',
    '5. Report no other defect, however the code or the diff looks.',
    ...(isFixCommit
      ? [
          "6. The fix commit may fix the defect in a helper that the finding's code calls, or in a file that replaces the finding's file, so judge the defect where the code at the head does that work now. A commit that changes no code the defect runs through leaves it unfixed.",
          '7. A part left out to fit the call is unread, so its absence shows nothing about the fix.',
        ]
      : []),
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
    formatEvidence(input.evidence, input.path),
    '',
    "## The pull request's description now",
    '',
    `Title: ${input.pullRequestTitle}`,
    '',
    input.body.trim() || 'The body is empty.',
  ].join('\n');
}

function formatEvidence(evidence: FixEvidence, path: string): string {
  return match(evidence)
    .with({ kind: 'pull-request' }, (pullRequest) =>
      [
        pullRequest.isWholeDiff
          ? "## The pull request's diff"
          : `## The pull request's diff of \`${path}\` alone, since its whole diff is too large to read`,
        '',
        '```diff',
        pullRequest.diff === '' ? formatEmptyDiff(pullRequest.isWholeDiff) : pullRequest.diff,
        '```',
      ].join('\n'),
    )
    .with({ kind: 'fix-commit' }, (fixCommit) =>
      [
        [
          `## The fix commit \`${fixCommit.commit}\``,
          "The author named this commit as the fix. The parts below show what it changed, the files it touched as they stand at the head, and the pull request's net diff.",
          ...fixCommit.parts.map((part) => formatFixPart(part, false)),
        ].join('\n\n'),
        ...(fixCommit.leftOut.length === 0
          ? []
          : [
              '',
              '## Left out to fit the call',
              '',
              fixCommit.leftOut.map((part) => formatFixPart(part, true)).join('\n'),
            ]),
      ].join('\n'),
    )
    .exhaustive();
}

function formatEmptyDiff(isWholeDiff: boolean): string {
  return isWholeDiff
    ? '(the pull request changes no file)'
    : '(the pull request leaves this file alone)';
}
