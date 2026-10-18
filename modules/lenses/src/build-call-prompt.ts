import type { LensID, NotReviewedFile } from '@noslop/contract';
import { formatPathCode } from '@noslop/contract';
import type { ChangedFile, Slices } from '@noslop/static-stage';
import { getLensPrompt } from './get-lens-prompt';
import { LENS_INPUTS } from './lens-inputs';
import { renderCriteria } from './render-criteria';
import { renderHunks } from './render-hunks';

// a changed file a call's input leaves out: a data file, a file too large for a call, or a file that
// another part of a split call reads
export interface LeftOutFile {
  path: string;
  reason: NotReviewedFile['reason'] | 'other-part';
}

export interface CallPromptInput {
  lenses: readonly LensID[];
  files: readonly ChangedFile[];
  slices: Slices;
  rules: readonly { name: string; body: string }[] | null;
  title: string;
  body: string;
  linkedIssue: string | null;

  // the changed files the call leaves out, so a lens never reports their missing hunks
  leftOut: readonly LeftOutFile[];
  base: string;
  head: string;

  // a re-review of a pull request covers only the commits since its last reviewed head, while its
  // title and body still describe the whole pull request
  isIncremental: boolean;
}

const INCREMENTAL_NOTE = [
  '## Incremental review',
  'This review covers only the commits since the last reviewed head of the pull request. The title and body describe the whole pull request, so they can name files and work that earlier commits hold.',
  'Do not report that the title or the body misdescribes the change, names a file the change does not touch, or claims work the diff does not show.',
].join('\n\n');

// joins the shared header, one section per lens in the order given, and the input the lenses read:
// the pull request, the hunks of the files in the call, each slice once and cut to those files, and
// the rules file when a lens reads it, and the changed files the call leaves out
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

    // every lens reads the pull request and its issue, because each one must tell a change made on
    // purpose from a defect
    `## Pull request\n\nTitle: ${input.title}\n\n${input.body.trim() || 'The body is empty.'}`,
  ];

  // the diff of a re-review leaves out what the earlier commits changed, so a file or a claim the
  // body names can look missing from it; the full review of the pull request judges the description
  if (input.isIncremental) {
    sections.push(INCREMENTAL_NOTE);
  }

  if (input.linkedIssue !== null) {
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

  if (input.leftOut.length > 0) {
    sections.push(renderLeftOut(input.leftOut));
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

const LEFT_OUT_REASONS: Readonly<Record<LeftOutFile['reason'], string>> = {
  data: 'a data file the config names',
  'too-large': 'too large for one call',
  'other-part': 'read by another call of this review',
};

function renderLeftOut(files: readonly LeftOutFile[]): string {
  return [
    '## Files left out',
    'The change holds these files, but this input leaves out their hunks and slices. Report no finding on what they hold, and no finding that their change is missing.',
    files
      .map((file) => `- ${formatPathCode(file.path)}: ${LEFT_OUT_REASONS[file.reason]}`)
      .join('\n'),
  ].join('\n\n');
}
