import type { LensID, LensNotReviewedFile, NotReviewedFile } from '@noslop/contract';
import { LENS_IDS } from '@noslop/contract';
import { LENS_INPUTS } from '@noslop/lenses';
import type { PlannedCall } from '@noslop/routing';
import type { CallPart, CallPartsInput } from './plan-call-parts';
import { planCallParts } from './plan-call-parts';

type SharedPromptInput = CallPartsInput['shared'];

export interface CallBatchPlanInput extends SharedPromptInput {
  calls: readonly PlannedCall[];
  data: readonly string[];
  maxCallChars: number;
  maxFileChars: number;
}

export interface CallBatchPlan {
  parts: CallPart[];

  // each changed file that no part reads, once
  notReviewed: NotReviewedFile[];

  // each changed file that a part reads while the calls of other lenses leave it out, once, with
  // those lenses
  notReviewedByLens: LensNotReviewedFile[];
}

// the parts every planned call of a review runs as, each with an ID no other call or part holds, the
// files that no part reads, and the files that only some lenses read
export function planCallBatch(input: CallBatchPlanInput): CallBatchPlan {
  const taken = new Set(input.calls.map((call) => call.callID));

  const planned = input.calls.map((call) => {
    const parts = planCallParts({
      call,
      shared: {
        slices: input.slices,
        rules: input.rules,
        title: input.title,
        body: input.body,
        linkedIssue: input.linkedIssue,
        base: input.base,
        head: input.head,
        isIncremental: input.isIncremental,
      },
      data: input.data,
      maxCallChars: input.maxCallChars,
      maxFileChars: input.maxFileChars,
      taken,
    });

    for (const part of parts.parts) {
      taken.add(part.call.callID);
    }

    return parts;
  });

  const parts = planned.flatMap((item) => item.parts);

  // a file one call leaves out can be read by another call, so a file is not reviewed only when no
  // part of any call puts its hunks in a prompt
  const read = new Set(
    parts.flatMap((part) => {
      const kinds = new Set(part.call.lenses.flatMap((lens) => LENS_INPUTS[lens].hunks));

      return part.call.files.filter((file) => kinds.has(file.kind)).map((file) => file.path);
    }),
  );

  const listed = new Map(
    planned
      .flatMap((item) => item.notReviewed)
      .filter((file) => !read.has(file.path))
      .map((file) => [file.path, file] as const),
  );

  return {
    parts,
    notReviewed: [...listed.values()],
    notReviewedByLens: collectLensNotReviewed(input.calls, planned, read),
  };
}

// a lens runs in one call, so the files that call leaves out are the files the lens never reads; a
// file no part reads is listed as not reviewed already, so it stays off this list
function collectLensNotReviewed(
  calls: readonly PlannedCall[],
  planned: readonly { notReviewed: readonly NotReviewedFile[] }[],
  read: ReadonlySet<string>,
): LensNotReviewedFile[] {
  const lenses = new Map<string, Set<LensID>>();

  for (const [index, call] of calls.entries()) {
    for (const file of planned[index]?.notReviewed ?? []) {
      if (!read.has(file.path)) {
        continue;
      }

      const skipped = lenses.get(file.path) ?? new Set<LensID>();

      for (const lens of call.lenses) {
        skipped.add(lens);
      }

      lenses.set(file.path, skipped);
    }
  }

  return [...lenses].map(([path, skipped]) => ({
    path,
    lenses: LENS_IDS.filter((lens) => skipped.has(lens)),
  }));
}
