import type { Runner } from '@noslop/runner';
import { readAncestry } from './read-ancestry';

export interface FixBaseInput {
  runner: Runner;
  repoDir: string;

  // the head of the last review, the pull request's head now, and the pull request's merge base
  base: string;
  head: string;
  mergeBase: string;

  // the head of the newest review that ran its lenses, which judged every fix before it
  lensHead: string | null;
}

// the answer a fix base is read for: the sha it names, and the head that posted its finding with
// the branch commit a rebase made of that head
export interface FixAnswer {
  commit: string;
  postedHead: string | null;
  postedBranchHead?: string;
}

// the commit a fix's range starts from, the commit whose code around the anchored line the call
// reads, and the full sha of the fix commit
export interface FixBase {
  base: string;
  anchor: string;
  commit: string;
}

// the run's base for a fix among the new commits; for a late `fixed` reply, the newer of the head
// that posted the finding and the last lens head; for a fix the base branch brought in after the
// finding, the fix commit's parent; null for a fix none of these holds
export async function readFixBase(
  input: FixBaseInput,
  fix: FixAnswer,
  range: readonly string[],
): Promise<FixBase | null> {
  const commit = findOneCommit(range, fix.commit);

  if (commit !== null) {
    return { base: input.base, anchor: input.base, commit };
  }

  const late = await readLateFixBase(input, fix);

  if (late !== null) {
    return late;
  }

  return readBaseBranchFixBase(input, fix);
}

// the one commit of the range a `fixed` sha names; a prefix that 2 commits share names neither
function findOneCommit(range: readonly string[], sha: string): string | null {
  const matches = range.filter((commit) => commit.startsWith(sha));

  return matches.length === 1 ? (matches[0] ?? null) : null;
}

async function readLateFixBase(input: FixBaseInput, fix: FixAnswer): Promise<FixBase | null> {
  const floors = [fix.postedBranchHead ?? fix.postedHead, input.lensHead].filter(
    (head) => head !== null,
  );

  const [first, second] = floors;

  if (first === undefined) {
    return null;
  }

  // a head a rebase left off the branch bounds no diff of it, and the fix must still come after it
  const held = await Promise.all(floors.map((head) => readAncestry(input, head, input.head)));

  if (held.includes(false)) {
    return null;
  }

  const newer = second === undefined ? first : await readNewerHead(input, first, second);

  const late = await input.runner.run(['git', 'rev-list', `${newer}..${input.head}`], {
    cwd: input.repoDir,
  });

  const commits = late.exitCode === 0 ? late.stdout.trim().split('\n') : [];
  const lateCommit = findOneCommit(commits, fix.commit);

  return lateCommit === null ? null : { base: newer, anchor: newer, commit: lateCommit };
}

// the head of the two that descends from the other, or the first when neither does
async function readNewerHead(input: FixBaseInput, first: string, second: string): Promise<string> {
  const isFirstOlder = await readAncestry(input, first, second);

  return isFirstOlder ? second : first;
}

// a fix that landed on the base branch, such as the layer below in a stack: the pull request's base
// holds it, the head that posted the finding does not, and it was written after that head
async function readBaseBranchFixBase(input: FixBaseInput, fix: FixAnswer): Promise<FixBase | null> {
  const posted = fix.postedHead;

  if (posted === null) {
    return null;
  }

  const commit = await readCommitSha(input, fix.commit);

  const parent = commit === null ? null : await readCommitSha(input, `${commit}^`);
  const isPostedRead = (await readCommitSha(input, posted)) !== null;

  if (commit === null || parent === null || !isPostedRead) {
    return null;
  }

  const [isInBase, isBeforePosted] = await Promise.all([
    readAncestry(input, commit, input.mergeBase),
    readAncestry(input, commit, posted),
  ]);

  if (!isInBase || isBeforePosted) {
    return null;
  }

  // a rebase gives each commit it moves a new committer date and keeps its author date, so only the
  // author date tells a fix written after the finding from an older commit a restack moved
  const [authored, postedCommitted] = await Promise.all([
    readCommitTime(input, '%at', commit),
    readCommitTime(input, '%ct', posted),
  ]);

  return authored < postedCommitted ? null : { base: parent, anchor: posted, commit };
}

// the full sha of the one commit a name gives, or null for a name that gives none or more than one
async function readCommitSha(input: FixBaseInput, name: string): Promise<string | null> {
  const result = await input.runner.run(
    ['git', 'rev-parse', '--verify', '--quiet', `${name}^{commit}`],
    { cwd: input.repoDir },
  );

  return result.exitCode === 0 ? result.stdout.trim() : null;
}

// the commit's author or committer time, in seconds since the epoch, by the format git gives it
async function readCommitTime(
  input: FixBaseInput,
  format: '%at' | '%ct',
  commit: string,
): Promise<number> {
  const result = await input.runner.run(['git', 'show', '-s', `--format=${format}`, commit], {
    cwd: input.repoDir,
  });

  if (result.exitCode !== 0) {
    throw new Error(`git show ${commit} failed: ${result.stderr.trim()}`);
  }

  return Number(result.stdout.trim());
}
