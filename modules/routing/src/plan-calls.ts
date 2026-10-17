import type { Depth, Effort, LensID } from '@noslop/contract';
import { effortSchema } from '@noslop/contract';
import { LENS_INPUTS } from '@noslop/lenses';
import { buildChunks } from './build-chunks';
import type { PlannedCall, RouteInput } from './types';

const DEPTH_EFFORT: Readonly<Record<Depth, Effort>> = {
  light: 'low',
  standard: 'medium',
  deep: 'high',
};

const LIGHT_CALL = 'L';
const SPLIT_AT_DEEP = 'A';

interface CallGroup {
  callID: string;
  lenses: LensID[];
}

// groups the fired lenses into calls by the config's grouping: one call at Light, call A split into
// its lenses at Deep, and a lens with a model of its own in a call of its own; each call then runs once
// per chunk whose files its lenses read
export function planCalls(
  input: RouteInput,
  lenses: readonly LensID[],
  depth: Depth,
): PlannedCall[] {
  const groups = buildGroups(input, lenses, depth).flatMap((group) => splitByModel(group, input));

  const chunks = buildChunks(
    input.change.files,
    input.packageDirs,
    input.config.thresholds.chunkLines,
  );

  return groups.flatMap((group) => {
    const kinds = new Set(group.lenses.flatMap((lens) => LENS_INPUTS[lens].hunks));

    const read = chunks.filter((chunk) => chunk.some((file) => kinds.has(file.kind)));

    // a call whose lenses read no hunks, such as reuse, reads its slices once
    const parts = read.length === 0 ? [input.change.files] : read;

    return parts.map((files, index) => ({
      callID: parts.length === 1 ? group.callID : `${group.callID}#${index + 1}`,
      lenses: group.lenses,
      effort: pickEffort(group.lenses, depth, input),
      model: input.config.lenses[group.lenses[0] ?? 'correctness']?.model ?? null,
      timeoutMs: pickTimeout(group.lenses, input),
      files: [...files],
    }));
  });
}

function buildGroups(input: RouteInput, lenses: readonly LensID[], depth: Depth): CallGroup[] {
  if (lenses.length === 0) {
    return [];
  }

  if (depth === 'light') {
    return [{ callID: LIGHT_CALL, lenses: [...lenses] }];
  }

  const fired = new Set(lenses);
  const placed = new Set<LensID>();

  const groups: CallGroup[] = [];

  for (const [callID, members] of Object.entries(input.config.calls).toSorted(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const inCall = members.filter((lens) => fired.has(lens) && !placed.has(lens));

    for (const lens of inCall) {
      placed.add(lens);
    }

    if (inCall.length === 0) {
      continue;
    }

    if (depth === 'deep' && callID === SPLIT_AT_DEEP) {
      groups.push(...inCall.map((lens) => ({ callID: `${callID}:${lens}`, lenses: [lens] })));
    } else {
      groups.push({ callID, lenses: inCall });
    }
  }

  // a fired lens that no call names runs in a call of its own
  for (const lens of lenses) {
    if (!placed.has(lens)) {
      groups.push({ callID: lens, lenses: [lens] });
    }
  }

  return groups;
}

// one call runs on one model, so a lens whose config names a model leaves its call for one of its own
function splitByModel(group: CallGroup, input: RouteInput): CallGroup[] {
  const byModel = new Map<string, LensID[]>();

  for (const lens of group.lenses) {
    const model = input.config.lenses[lens]?.model ?? '';

    byModel.set(model, [...(byModel.get(model) ?? []), lens]);
  }

  if (byModel.size === 1) {
    return [group];
  }

  return [...byModel.values()].map((members, index) => ({
    callID: index === 0 ? group.callID : `${group.callID}:${members.join('+')}`,
    lenses: members,
  }));
}

// a call runs at the highest effort that any of its lenses asks for
function pickEffort(lenses: readonly LensID[], depth: Depth, input: RouteInput): Effort {
  const efforts = lenses.map((lens) => input.config.lenses[lens]?.effort ?? DEPTH_EFFORT[depth]);
  const ranked = effortSchema.options;

  return efforts.reduce(
    (highest, effort) => (ranked.indexOf(effort) > ranked.indexOf(highest) ? effort : highest),
    ranked[0] ?? 'low',
  );
}

function pickTimeout(lenses: readonly LensID[], input: RouteInput): number | null {
  const timeouts = lenses.flatMap((lens) => {
    const timeout = input.config.lenses[lens]?.timeoutMs;

    return timeout === undefined ? [] : [timeout];
  });

  return timeouts.length === 0 ? null : Math.max(...timeouts);
}
