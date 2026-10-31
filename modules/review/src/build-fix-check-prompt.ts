import { match } from 'ts-pattern';
import type { FixPart } from './format-fix-part';
import { formatFixPart } from './format-fix-part';

export type FixEvidence =
  | { kind: 'pull-request'; diff: string; isWholeDiff: boolean }
  | { kind: 'fix-commit'; commit: string; parts: readonly FixPart[]; leftOut: readonly FixPart[] };

interface RepeatedReport {
  title: string;
  comment: string;
}

export interface FixCheckPromptInput {
  title: string;
  lens: string;
  comment: string;

  repeats: readonly RepeatedReport[];
  path: string;
  code: string;
  isTraced: boolean;
  evidence: FixEvidence;
  pullRequestTitle: string;
  body: string;
}

export function buildFixCheckPrompt(input: FixCheckPromptInput): string {
  const isFixCommit = input.evidence.kind === 'fix-commit';

  const rules = [
    'Answer `fixed: true` only when the code at the head and the description no longer hold the defect the finding describes. The fix may be in another file, such as a new test that the finding asks for. The fix of a finding about the title or the body is an edit to the description, which the diff never shows.',
    'Answer `fixed: false` when the code or the description still holds the defect, or the diff moves the defect elsewhere.',
    'Judge the defect where the finding places it. When the finding asks that an expected outcome, such as a refused input, come back as a result, and the code at the head returns it as a result, a throw that reports that result at the edge of the program, such as a command that turns it into an exit code, is not the defect.',
    'The pull request may move the code or the test of a fix to another file and reshape it there. Count code or a test that the diff deletes as moved when the diff adds code or a test in another file that does what the deleted lines did, in other lines or not.',
    'Give the reason in one line.',
    'Report no other defect, however the code or the diff looks.',
    ...(isFixCommit
      ? [
          "The fix commit may fix the defect in a helper that the finding's code calls, or in a file that replaces the finding's file, so judge the defect where the code at the head does that work now. A commit that changes no code the defect runs through leaves it unfixed.",
          'A part left out to fit the call is unread, so its absence shows nothing about the fix.',
        ]
      : []),
    ...(input.repeats.length === 0
      ? []
      : [
          'A later review reported the finding again in other words, and the author answered each report with the same fix. Every report below describes the one defect, so give one verdict for all of them.',
        ]),
  ];

  return [
    'A reviewer posted the finding below on a pull request, and the author answered that the pull request fixes it.',
    isFixCommit
      ? "Judge from the finding, its code at the pull request's head, the fix commit the author named, the files that commit touched and the pull request's description now whether the pull request still holds the defect. Read no files."
      : "Judge from the finding, its code at the pull request's head, the pull request's diff and its description now whether the pull request still holds the defect. Read no files.",
    '',
    ...rules.map((rule, index) => `${index + 1}. ${rule}`),
    '',
    `## The finding: ${input.title}`,
    '',
    `Lens: ${input.lens}`,
    '',
    input.comment,
    '',
    ...input.repeats.flatMap((repeat) => [
      `## The same finding, reported again: ${repeat.title}`,
      '',
      repeat.comment,
      '',
    ]),
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
