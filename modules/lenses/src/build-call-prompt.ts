import type { LensID } from '@noslop/contract';
import type { ChangedFile, Slices } from '@noslop/static-stage';
import { getLensPrompt } from './get-lens-prompt';
import { LENS_INPUTS } from './lens-inputs';
import { renderCriteria } from './render-criteria';
import { renderHunks } from './render-hunks';

export interface CallPromptInput {
  lenses: readonly LensID[];
  files: readonly ChangedFile[];
  slices: Slices;
  rules: readonly { name: string; body: string }[] | null;
  title: string;
  body: string;
  linkedIssue: string | null;
  base: string;
  head: string;

  // a closing instruction for a pass that is not a first review, such as the verify pass
  task: string | null;
}

// joins the shared header, one section per lens in the order given, and the input the lenses read:
// the hunks of the files in the call, each slice once, cut to those files, and the rules file and
// the pull request when a lens reads them
export function buildCallPrompt(input: CallPromptInput): string {
  const lensInputs = input.lenses.map((lens) => LENS_INPUTS[lens]);

  const kinds = new Set(lensInputs.flatMap((lensInput) => lensInput.hunks));

  const sliceNames = [...new Set(lensInputs.flatMap((lensInput) => lensInput.slices))];

  const paths = new Set(input.files.map((file) => file.path));

  const hunkFiles = input.files.filter((file) => kinds.has(file.kind));

  const sections = [
    getLensPrompt('shared-header').replace('{{criteria}}', renderCriteria()),
    ...input.lenses.map((lens) => `# Lens: ${lens}\n\n${getLensPrompt(lens)}`),
    '# Input',
    `The change runs from commit ${input.base} to commit ${input.head}.`,
  ];

  if (lensInputs.some((lensInput) => lensInput.pullRequest)) {
    sections.push(
      `## Pull request\n\nTitle: ${input.title}\n\n${input.body.trim() || 'The body is empty.'}`,
    );
  }

  if (lensInputs.some((lensInput) => lensInput.linkedIssue) && input.linkedIssue !== null) {
    sections.push(`## Linked issue\n\n${input.linkedIssue.trim()}`);
  }

  if (lensInputs.some((lensInput) => lensInput.rules)) {
    sections.push(renderRules(input.rules));
  }

  if (hunkFiles.length > 0) {
    sections.push(`## Hunks\n\n${renderHunks(hunkFiles)}`);
  }

  for (const name of sliceNames) {
    const slice = collectSliceItems(input.slices[name], paths);

    sections.push(`## Slice: ${name}\n\n\`\`\`json\n${JSON.stringify(slice, null, 2)}\n\`\`\``);
  }

  if (input.task !== null) {
    sections.push(`# Task\n\n${input.task}`);
  }

  return `${sections.join('\n\n')}\n`;
}

function renderRules(rules: CallPromptInput['rules']): string {
  if (rules === null || rules.length === 0) {
    return '## Rules file\n\nThe repo names no rules file, so report no taste finding.';
  }

  return ['## Rules file', ...rules.map((rule) => `### ${rule.name}\n\n${rule.body}`)].join('\n\n');
}

// a slice that is a list keeps the items on the call's files; the comment density covers the whole
// change and stays whole
function collectSliceItems(slice: Slices[keyof Slices], paths: ReadonlySet<string>): unknown {
  if (!Array.isArray(slice)) {
    return slice;
  }

  return slice.filter((item: unknown) => {
    const path = findItemPath(item);

    return path === null || paths.has(path);
  });
}

function findItemPath(item: unknown): string | null {
  if (typeof item === 'string') {
    return item;
  }

  if (typeof item !== 'object' || item === null) {
    return null;
  }

  if ('path' in item && typeof item.path === 'string') {
    return item.path;
  }

  if ('location' in item) {
    return findItemPath(item.location);
  }

  return 'function' in item ? findItemPath(item.function) : null;
}
