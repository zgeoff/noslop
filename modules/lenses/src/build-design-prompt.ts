import type { EarlierFinding, Finding } from '@noslop/contract';
import { formatPathCode } from '@noslop/contract';
import type { ChangedFile } from '@noslop/static-stage';
import { getLensPrompt } from './get-lens-prompt';
import { renderCriteria } from './render-criteria';
import { renderHunks } from './render-hunks';
import type { LeftOutFile } from './render-left-out';
import { renderLeftOut } from './render-left-out';

// the task is what the pull request states, so the design pass reads its title and body and never a
// linked issue, whatever tracker the issue lives in
export interface DesignPromptInput {
  title: string;
  body: string;

  // the findings of this review, after the merge pass
  latest: readonly Finding[];

  // the findings the earlier reviews of the pull request posted
  earlier: readonly EarlierFinding[];

  // the files of the whole pull request since its merge base, which the pass reads in place of a
  // re-review's new commits alone, since an approach spans every round
  files: readonly ChangedFile[];
  leftOut: readonly LeftOutFile[];
  base: string;
  head: string;

  // the hunks pass the call limit, so the prompt lists the files and the model reads their diff in
  // its working directory, which leaves no part of the pull request out
  isDiffListed: boolean;
}

// the prompt of the design pass: the shared header, the design lens, and its input, with the
// findings as JSON, so the model reads which logic each review patched
export function buildDesignPrompt(input: DesignPromptInput): string {
  const sections = [
    getLensPrompt('shared-header').replace('{{criteria}}', renderCriteria()),
    `# Lens: design\n\n${getLensPrompt('design')}`,
    '# Input',
    `The pull request runs from commit ${input.base} to commit ${input.head}.`,
    `## Pull request\n\nTitle: ${input.title}\n\n${input.body.trim() || 'The body is empty.'}`,
    renderFindings(
      '## Findings of this review',
      'This review reports no finding.',
      input.latest.map((finding) => ({
        id: finding.id,
        lens: finding.lens,
        severity: finding.severity,
        title: finding.title,
        body: finding.body,
        anchor: finding.anchor,
      })),
    ),
    renderFindings(
      '## Findings of the earlier reviews',
      'The earlier reviews posted no finding.',
      input.earlier,
    ),
  ];

  if (input.files.length > 0) {
    const diff = input.isDiffListed
      ? renderListedDiff(input)
      : `## Hunks\n\n${renderHunks(input.files)}`;

    sections.push(diff);
  }

  if (input.leftOut.length > 0) {
    sections.push(renderLeftOut(input.leftOut));
  }

  return `${sections.join('\n\n')}\n`;
}

function renderListedDiff(input: DesignPromptInput): string {
  return [
    '## Changed files',
    `The hunks of this pull request are too large for this input. Read the diff of each file below in your working directory with \`git diff ${input.base} ${input.head} -- <path>\`, and read every file before you judge the approach.`,
    input.files.map((file) => `- ${formatPathCode(file.path)}`).join('\n'),
  ].join('\n\n');
}

function renderFindings(heading: string, empty: string, findings: readonly unknown[]): string {
  if (findings.length === 0) {
    return `${heading}\n\n${empty}`;
  }

  return `${heading}\n\n\`\`\`json\n${JSON.stringify(findings, null, 2)}\n\`\`\``;
}
