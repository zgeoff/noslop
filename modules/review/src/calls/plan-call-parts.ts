import type { NotReviewedFile } from '@noslop/contract';
import type { CallPromptInput, LeftOutFile } from '@noslop/lenses';
import { buildCallPrompt } from '@noslop/lenses';
import type { PlannedCall } from '@noslop/routing';
import type { ChangedFile } from '@noslop/static-stage';

export interface CallPartsInput {
  call: PlannedCall;

  shared: Omit<CallPromptInput, 'lenses' | 'files' | 'leftOut'>;

  data: readonly string[];
  maxCallChars: number;
  maxFileChars: number;

  taken: ReadonlySet<string>;
}

export interface CallPart {
  call: PlannedCall;
  prompt: string;
}

export interface CallParts {
  parts: CallPart[];

  notReviewed: NotReviewedFile[];
}

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

  if (kept.length === 0 && input.call.files.length > 0) {
    return { parts: [], notReviewed: leftOut };
  }

  const keptCall = { ...input.call, files: kept.map((item) => item.file) };
  const whole = buildPartPrompt(input, keptCall.files, leftOut);

  if (whole.length <= input.maxCallChars) {
    return { parts: [{ call: keptCall, prompt: whole }], notReviewed: leftOut };
  }

  const reasons = new Map(leftOut.map((file) => [file.path, file] as const));

  const bound = input.call.files.map(
    (file): LeftOutFile => reasons.get(file.path) ?? { path: file.path, reason: 'other-part' },
  );

  const base = buildPartPrompt(input, [], bound).length;

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

interface FittedFiles {
  groups: ChangedFile[][];

  overflow: ChangedFile[];
}

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

function pickPartIDs(callID: string, count: number, taken: ReadonlySet<string>): string[] {
  const ids: string[] = [];

  for (let index = 0; index < count; index += 1) {
    if (index === 0) {
      ids.push(callID);
      continue;
    }

    const name = `${callID}-part-${index + 1}`;
    let id = name;

    for (let suffix = 2; taken.has(id) || ids.includes(id); suffix += 1) {
      id = `${name}-${suffix}`;
    }

    ids.push(id);
  }

  return ids;
}
