import type { NotReviewedFile } from '@noslop/contract';
import type { CallPromptInput, LeftOutFile } from '@noslop/lenses';
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

  // the call IDs the review holds already, which no part takes
  taken: ReadonlySet<string>;
}

export interface CallPart {
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

    // the size counts the file's hunks and its slice items, since both go into the prompt
    const size = buildPartPrompt(input, [file], []).length - empty.length;

    if (size > input.maxFileChars) {
      leftOut.push({ path: file.path, reason: 'too-large' });
      continue;
    }

    kept.push({ file, size });
  }

  const keptCall = { ...input.call, files: kept.map((item) => item.file) };
  const whole = buildPartPrompt(input, keptCall.files, leftOut);

  if (whole.length <= input.maxCallChars) {
    return { parts: [{ call: keptCall, prompt: whole }], notReviewed: leftOut };
  }

  // each part lists every file of the call it leaves out, so the fit measures a list of every file
  // under the longest reason, which no part's own list passes
  const bound = pickLongestLeftOut(input);
  const base = buildPartPrompt(input, [], bound).length;

  // the input around the files overflows alone, such as a pull request body over the limit; the call
  // runs whole, so its failure shows in the review
  if (base > input.maxCallChars) {
    return { parts: [{ call: keptCall, prompt: whole }], notReviewed: leftOut };
  }

  const fitted = splitFiles(input, bound, base, kept);

  const overflow = new Set(fitted.overflow.map((file) => file.path));

  const notReviewed = input.call.files.flatMap((file): NotReviewedFile[] => {
    const listed = leftOut.find((item) => item.path === file.path);

    if (listed !== undefined) {
      return [listed];
    }

    return overflow.has(file.path) ? [{ path: file.path, reason: 'too-large' }] : [];
  });

  // a call whose files each overflow alone gets no part, so the review records none of its lenses as
  // run
  const ids = pickPartIDs(input.call.callID, fitted.groups.length, input.taken);

  const parts = fitted.groups.map((files, index) => {
    const paths = new Set(files.map((file) => file.path));

    const partLeftOut = input.call.files
      .filter((file) => !paths.has(file.path))
      .map(
        (file): LeftOutFile =>
          notReviewed.find((item) => item.path === file.path) ?? {
            path: file.path,
            reason: 'other-part',
          },
      );

    return {
      call: { ...input.call, callID: ids[index] ?? input.call.callID, files },
      prompt: buildPartPrompt(input, files, partLeftOut),
    };
  });

  return { parts, notReviewed };
}

function buildPartPrompt(
  input: CallPartsInput,
  files: readonly ChangedFile[],
  leftOut: readonly LeftOutFile[],
): string {
  return buildCallPrompt({ ...input.shared, lenses: input.call.lenses, files, leftOut });
}

const LEFT_OUT_REASONS = [
  'data',
  'too-large',
  'other-part',
] as const satisfies readonly LeftOutFile['reason'][];

function pickLongestLeftOut(input: CallPartsInput): LeftOutFile[] {
  const lists = LEFT_OUT_REASONS.map((reason) =>
    input.call.files.map((file) => ({ path: file.path, reason })),
  );

  const sized = lists.map((list) => ({ list, size: buildPartPrompt(input, [], list).length }));

  return sized.toSorted((a, b) => b.size - a.size)[0]?.list ?? [];
}

interface FittedFiles {
  groups: ChangedFile[][];

  // the files that overflow a call even alone
  overflow: ChangedFile[];
}

// packs the files in order into groups by the size each adds to the prompt, then builds each group's
// prompt and halves a group whose prompt still overflows, since the sizes are estimates: the files of
// a group can share slice items
function splitFiles(
  input: CallPartsInput,
  bound: readonly LeftOutFile[],
  base: number,
  kept: readonly { file: ChangedFile; size: number }[],
): FittedFiles {
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

  const halves = packed.map((files) => splitOverflowingGroup(input, bound, files));

  return {
    groups: halves.flatMap((half) => half.groups),
    overflow: halves.flatMap((half) => half.overflow),
  };
}

function splitOverflowingGroup(
  input: CallPartsInput,
  bound: readonly LeftOutFile[],
  files: readonly ChangedFile[],
): FittedFiles {
  // the part's prompt lists every file of the call but its own, so the measure leaves its own out
  const paths = new Set(files.map((file) => file.path));

  const others = bound.filter((file) => !paths.has(file.path));

  if (buildPartPrompt(input, files, others).length <= input.maxCallChars) {
    return { groups: [[...files]], overflow: [] };
  }

  const [only] = files;

  if (files.length === 1 && only !== undefined) {
    return { groups: [], overflow: [only] };
  }

  const half = Math.ceil(files.length / 2);
  const first = splitOverflowingGroup(input, bound, files.slice(0, half));
  const second = splitOverflowingGroup(input, bound, files.slice(half));

  return {
    groups: [...first.groups, ...second.groups],
    overflow: [...first.overflow, ...second.overflow],
  };
}

// the first part keeps the call's ID, and each later part takes the ID with its part number, with a
// count after it when the review holds that ID already, such as a configured call named that way
function pickPartIDs(callID: string, count: number, taken: ReadonlySet<string>): string[] {
  const ids: string[] = [];

  for (let index = 0; index < count; index += 1) {
    if (index === 0) {
      ids.push(callID);
      continue;
    }

    // a part ID runs longer than its call's ID, so an adapter that names a file after a call bounds
    // the name
    const name = `${callID}-part-${index + 1}`;
    let id = name;

    for (let suffix = 2; taken.has(id) || ids.includes(id); suffix += 1) {
      id = `${name}-${suffix}`;
    }

    ids.push(id);
  }

  return ids;
}
