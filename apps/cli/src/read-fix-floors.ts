import type { AnsweredFix } from '@noslop/review';
import type { Runner } from '@noslop/runner';
import { readRebasedHead } from './read-rebased-head';

export interface FixFloorsInput {
  repoDir: string;

  // the pull request's base and head now
  base: string;
  head: string;

  // the head of the newest lens review, as the summary marker keeps it
  lensHead: string | null;
  fixes: readonly AnsweredFix[];
}

export interface FixFloors {
  lensHead: string | null;
  fixes: AnsweredFix[];
}

// a lens review judged the fixes before it by their shas then, and the check reads no rewritten sha
// as judged, so a lens head that a rebase left off the branch bounds no late fix, while the head that
// posted a finding stands as the branch commit the rebase made of it
export async function readFixFloors(runner: Runner, input: FixFloorsInput): Promise<FixFloors> {
  const reads = new Map<string, Promise<string>>();

  const readPostedHead = (commit: string | null): Promise<string | null> => {
    if (commit === null) {
      return Promise.resolve(null);
    }

    const read = reads.get(commit) ?? readBranchHead(runner, input, commit);

    reads.set(commit, read);

    return read;
  };

  const isLensHeadHeld =
    input.lensHead === null
      ? false
      : await probeAncestry(runner, input.repoDir, input.lensHead, input.head);

  const postedHeads = await Promise.all(input.fixes.map((fix) => readPostedHead(fix.postedHead)));

  const fixes: AnsweredFix[] = [];

  for (const [index, fix] of input.fixes.entries()) {
    fixes.push({ ...fix, postedHead: postedHeads[index] ?? null });
  }

  return { lensHead: isLensHeadHeld ? input.lensHead : null, fixes };
}

// the head itself while the branch holds it, else the branch commit a rebase made of it, else the
// head, which then bounds no fix
async function readBranchHead(
  runner: Runner,
  input: FixFloorsInput,
  commit: string,
): Promise<string> {
  const held = await probeAncestry(runner, input.repoDir, commit, input.head);

  if (held) {
    return commit;
  }

  const rebased = await readRebasedHead(runner, {
    repoDir: input.repoDir,
    reviewed: commit,
    base: input.base,
    head: input.head,
  });

  return rebased.head ?? commit;
}

async function probeAncestry(
  runner: Runner,
  repoDir: string,
  commit: string,
  descendant: string,
): Promise<boolean> {
  const result = await runner.run(['git', 'merge-base', '--is-ancestor', commit, descendant], {
    cwd: repoDir,
  });

  return result.exitCode === 0;
}
