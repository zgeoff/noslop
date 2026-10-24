import type { LensID } from '@noslop/contract';
import type { ChangedFile } from '@noslop/static-stage';
import { fillOtherLenses } from './fill-other-lenses';
import { getLensPrompt } from './get-lens-prompt';
import { renderCriteria } from './render-criteria';
import { renderHunks } from './render-hunks';

export const RESOLUTION_LENSES = ['correctness', 'security'] as const satisfies readonly LensID[];

export interface ResolutionPromptInput {
  merge: string;
  parents: readonly [string, string];

  conflicted: readonly string[];

  files: readonly ChangedFile[];
}

const RESOLUTION_TASK = [
  '# Resolution check',
  "This change is what one merge commit wrote itself. Its base is the tree that `git merge-tree --write-tree` builds from the merge's 2 parents, and its head is the merge commit. In a file git could not merge, the deleted lines hold git's conflict markers with the lines of each side between them, and the added lines are the resolution the author kept. Every other changed line is a hand edit the author made in the merge.",
  '1. Answer `sound: true` only when the resolution keeps the change each side made and adds no defect.',
  '2. Answer `sound: false` when the resolution drops or reverts a change either side made, leaves a conflict marker in place, or adds a defect. Report each such defect as a finding on the lines of the resolution.',
  '3. Give the reason in one line.',
  '4. Report only defects in the lines this change shows. Code that either parent already holds is out of scope, and a defect it holds is no finding.',
  '5. The pull request names no rules file here, so report no taste finding.',
].join('\n\n');

export function buildResolutionPrompt(input: ResolutionPromptInput): string {
  const conflicted =
    input.conflicted.length === 0
      ? 'git merged every file on its own, so each change is a hand edit.'
      : `git could not merge these files: ${input.conflicted.map((path) => `\`${path}\``).join(', ')}.`;

  const sections = [
    getLensPrompt('shared-header').replace('{{criteria}}', renderCriteria()),
    ...RESOLUTION_LENSES.map(
      (lens) => `# Lens: ${lens}\n\n${fillOtherLenses(getLensPrompt(lens), RESOLUTION_LENSES)}`,
    ),
    RESOLUTION_TASK,
    'Answer with `sound`, `reason` and the findings lists, in JSON that matches the output schema.',
    '# Input',
    `The merge commit is ${input.merge}, with the parents ${input.parents[0]} and ${input.parents[1]}. ${conflicted}`,
    `## Hunks\n\n${renderHunks(input.files)}`,
  ];

  return `${sections.join('\n\n')}\n`;
}
