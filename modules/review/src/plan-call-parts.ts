import type { NotReviewedFile } from '@noslop/contract';
import type { CallPromptInput } from '@noslop/lenses';
import { buildCallPrompt } from '@noslop/lenses';
import type { PlannedCall } from '@noslop/routing';
import type { ChangedFile } from '@noslop/static-stage';

export interface CallPartsInput {
  call: PlannedCall;

  // the prompt input that every part of the call shares
  shared: Omit<CallPromptInput, 'lenses' | 'files' | 'leftOut'>;

  // the config's data globs, whose matches no part reads
  data: readonly string[];
  maxCallChars: number;
  maxFileChars: number;
}

interface CallPart {
  call: PlannedCall;
  prompt: string;
}

export interface CallParts {
  parts: CallPart[];

  // the call's files that no part reads, in the order of the call's files
  notReviewed: NotReviewedFile[];
}

// the calls that one planned call runs as, each with its prompt: the call whole when its prompt fits
// the limit, or else its files split into parts that each fit; a data file, and a file whose own
// input passes the file limit or alone overflows a call, goes into no part and is listed instead
export function planCallParts(input: CallPartsInput): CallParts {
  const globs = input.data.map((glob) => new Bun.Glob(glob));
  const empty = buildPartPrompt(input, [], []);
  const leftOut: NotReviewedFile[] = [];
  const kept: { file: ChangedFile; size: number }[] = [];

  for (const file of input.call.files) {
    if (globs.some((glob) => glob.match(file.path))) {
      leftOut.push({ path: file.path, reason: 'data' });
      continue;
    }

    const size = buildPartPrompt(input, [file], []).length - empty.length;

    if (size > input.maxFileChars) {
      leftOut.push({ path: file.path, reason: 'too-large' });
      continue;
    }

    kept.push({ file, size });
  }

  const whole = buildPartPrompt(
    input,
    kept.map((item) => item.file),
    leftOut,
  );

  const keptCall = { ...input.call, files: kept.map((item) => item.file) };

  if (whole.length <= input.maxCallChars) {
    return { parts: [{ call: keptCall, prompt: whole }], notReviewed: leftOut };
  }

  const fitted = splitFiles(input, leftOut, kept);

  // with no file that fits, the input around the files overflows alone, such as a pull request body
  // over the limit; the call runs whole, so its failure shows in the review
  if (fitted.groups.length === 0) {
    return { parts: [{ call: keptCall, prompt: whole }], notReviewed: leftOut };
  }

  const overflow = new Set(fitted.overflow.map((file) => file.path));

  const notReviewed = input.call.files.flatMap((file): NotReviewedFile[] => {
    const listed = leftOut.find((item) => item.path === file.path);

    if (listed !== undefined) {
      return [listed];
    }

    return overflow.has(file.path) ? [{ path: file.path, reason: 'too-large' }] : [];
  });

  const parts = fitted.groups.map((group, index) => ({
    call: {
      ...input.call,
      callID: index === 0 ? input.call.callID : `${input.call.callID}-part-${index + 1}`,
      files: group.files,
    },
    prompt: group.prompt,
  }));

  return { parts, notReviewed };
}

function buildPartPrompt(
  input: CallPartsInput,
  files: readonly ChangedFile[],
  leftOut: readonly NotReviewedFile[],
): string {
  return buildCallPrompt({ ...input.shared, lenses: input.call.lenses, files, leftOut });
}

interface FittedGroup {
  files: ChangedFile[];
  prompt: string;
}

interface FittedFiles {
  groups: FittedGroup[];

  // the files that overflow a call even alone
  overflow: ChangedFile[];
}

// packs the files in order into groups by the size each adds to the prompt, then builds each group's
// prompt and halves a group whose prompt still overflows, since the sizes are estimates: the files of
// a group can share slice items
function splitFiles(
  input: CallPartsInput,
  leftOut: readonly NotReviewedFile[],
  kept: readonly { file: ChangedFile; size: number }[],
): FittedFiles {
  const base = buildPartPrompt(input, [], leftOut).length;
  const packed: ChangedFile[][] = [];
  let current: ChangedFile[] = [];
  let total = base;

  for (const item of kept) {
    if (current.length > 0 && total + item.size > input.maxCallChars) {
      packed.push(current);

      current = [];
      total = base;
    }

    current.push(item.file);

    total += item.size;
  }

  if (current.length > 0) {
    packed.push(current);
  }

  const fitted: FittedFiles = { groups: [], overflow: [] };

  for (const files of packed) {
    collectFittedGroups(input, leftOut, files, fitted);
  }

  return fitted;
}

function collectFittedGroups(
  input: CallPartsInput,
  leftOut: readonly NotReviewedFile[],
  files: readonly ChangedFile[],
  fitted: FittedFiles,
): void {
  const prompt = buildPartPrompt(input, files, leftOut);

  if (prompt.length <= input.maxCallChars) {
    fitted.groups.push({ files: [...files], prompt });

    return;
  }

  const [only] = files;

  if (files.length === 1 && only !== undefined) {
    fitted.overflow.push(only);

    return;
  }

  const half = Math.ceil(files.length / 2);

  collectFittedGroups(input, leftOut, files.slice(0, half), fitted);
  collectFittedGroups(input, leftOut, files.slice(half), fitted);
}
