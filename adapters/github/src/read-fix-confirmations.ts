import type { Disposition, FixFileEvidence, PullRequestRef } from '@noslop/contract';
import { buildFixFileEvidence } from '@noslop/contract';
import { buildFixConfirmation } from './build-fix-confirmation';
import type { GitHubClient } from './create-github-connection';
import type { FixConfirmation } from './format-summary-comment';
import type { CommitChange } from './make-commit-change-reader';
import { makeCommitChangeReader } from './make-commit-change-reader';
import type { FixState } from './pick-next-fix-state';
import { pickRangeFix } from './pick-range-fix';
import type { CommitFiles } from './read-commit-files';
import { readCommitFiles } from './read-commit-files';
import type { FixCommits } from './read-fix-commits';
import { readFixCoverage } from './read-fix-coverage';
import type { FindingThread } from './read-pull-request-state';
import { readRangeCommits } from './read-range-commits';

// a file the review read while the calls of the listed lenses left it out
interface LensNotReviewedPath {
  path: string;
  lenses: readonly string[];
}

// one review as the confirmation reads it: the range it covered, the findings it reported, the files
// it left out, and the files that only some lenses read
export interface ReviewedRange {
  base: string;
  head: string;
  reported: readonly string[];
  notReviewed: readonly string[];
  notReviewedByLens: readonly LensNotReviewedPath[];

  // a review with a failed call, which read no fix in full: a design fix waits on the design call, a
  // lens fix on its lens call, so the review confirms none, as a partial range a marker keeps does not
  isPartial?: boolean;

  // a fixes-only run's range, which read only these findings and found them fixed; it reads no other
  // finding, so it confirms no other fix
  checked?: readonly string[];
}

export interface FixConfirmationsInput {
  threads: readonly FindingThread[];
  dispositions: readonly Disposition[];
  fixCommits: FixCommits;
  review: ReviewedRange;

  // where each `<finding id>:<commit>` answer stands after the earlier reviews; an answer it lacks is
  // silent
  held: ReadonlyMap<string, FixState>;
}

// reads from GitHub what each `fixed` answer needs against one review, and leaves the decision to
// buildFixConfirmation; the commit may change any file of the pull request, since a fix such as a
// missing test lives beside the finding's file
export async function readFixConfirmations(
  client: GitHubClient,
  pr: PullRequestRef,
  input: FixConfirmationsInput,
): Promise<FixConfirmation[]> {
  const review = input.review;

  const range = await readRangeCommits(client, pr, review.base, review.head);

  const latest = new Map(input.dispositions.map((item) => [item.findingID, item]));

  // a not-reviewed file never fails the check alone, but a pending fix that reaches one stays
  // unconfirmed, and its open finding fails the check; a file that the call of the finding's own lens
  // left out counts as not reviewed for that finding, since only that lens's silence shows a fix
  const notReviewed = new Set(review.notReviewed);
  const sincePosted = new Map<string, Promise<string[]>>();

  const readSincePosted = (posted: string): Promise<string[]> => {
    const commits = sincePosted.get(posted) ?? readRangeCommits(client, pr, posted, review.head);

    sincePosted.set(posted, commits);

    return commits;
  };

  const readChange = makeCommitChangeReader(client, pr);

  const fileReads = new Map<string, Promise<CommitFiles>>();

  const readFiles = (commit: string): Promise<CommitFiles> => {
    const files = fileReads.get(commit) ?? readCommitFiles(client, pr, commit);

    fileReads.set(commit, files);

    return files;
  };

  const confirmations = input.threads.map(async (thread) => {
    const disposition = latest.get(thread.marker.id);

    if (disposition?.kind !== 'fixed') {
      return [];
    }

    const commit = disposition.value;
    const rewrite = input.fixCommits.rewritten.get(`${thread.marker.id}:${commit}`);
    const match = rewrite === undefined ? findOneCommit(input.fixCommits, commit) : rewrite.commit;
    const posted = thread.marker.head;

    // a full review covers the whole branch, so only a commit after the head that posted the finding
    // is a fix of it; a marker without that head leaves the review's range alone to decide, and a
    // rewrite passed that check on the commits before the rebase
    const isAfterChecked = posted === undefined || rewrite !== undefined;
    const after = isAfterChecked ? range : await readSincePosted(posted);

    const rangeFix =
      match === null
        ? null
        : await readRangeFix({
            range,
            match,
            named: commit,
            fixCommits: input.fixCommits,
            readChange,
          });

    const isInRange = rangeFix !== null && after.includes(rangeFix);
    const skipped = collectLensSkipped(notReviewed, review.notReviewedByLens, thread.marker.lens);
    const isUnchecked = review.checked !== undefined && !review.checked.includes(thread.marker.id);
    const isFileSkipped = isUnchecked || skipped.has(thread.marker.path);

    const read =
      isInRange && rangeFix !== null && !isFileSkipped && skipped.size > 0
        ? await readFixCoverage(client, pr, {
            commit: rangeFix,
            head: review.head,
            skipped,
            findingPath: thread.marker.path,
          })
        : { changesSkipped: false, failure: null };

    const commitFiles = match === null ? null : await readFiles(match);

    const files =
      commitFiles === null
        ? { evidence: null, failure: null }
        : buildFixFiles(commitFiles, input.fixCommits, thread.marker.path);

    const coverage = {
      ...read,
      failure: read.failure ?? rewrite?.failure ?? files.failure,
    };

    return [
      buildFixConfirmation({
        id: thread.marker.id,
        title: thread.marker.title,
        commit,
        match,
        isInRange,
        isFileSkipped,
        isPartial: review.isPartial === true,
        coverage,
        held: input.held.get(`${thread.marker.id}:${commit}`) ?? 'silent',
        isReported: review.reported.includes(thread.marker.id),
        files: files.evidence,
      }),
    ];
  });

  const all = await Promise.all(confirmations);

  return all.flat();
}

// the one branch commit a `fixed` sha names; a prefix that 2 commits share names neither, and so does
// one that GitHub finds ambiguous
function findOneCommit(fixCommits: FixCommits, sha: string): string | null {
  if (fixCommits.ambiguous.includes(sha)) {
    return null;
  }

  const matches = fixCommits.commits.filter((commit) => commit.startsWith(sha));

  return matches.length === 1 ? (matches[0] ?? null) : null;
}

interface RangeFixReadInput {
  range: readonly string[];
  match: string;
  named: string;
  fixCommits: FixCommits;
  readChange: (ref: string) => Promise<CommitChange | null>;
}

// the commit of a review's range that is the fix, reading the patches only when the picker needs
// them
async function readRangeFix(input: RangeFixReadInput): Promise<string | null> {
  const pickInput = {
    range: input.range,
    match: input.match,
    named: input.named,
    branchCommits: input.fixCommits.commits,
  };

  const first = pickRangeFix({ ...pickInput, changes: null });

  if (first.kind !== 'read') {
    return first.kind === 'found' ? first.commit : null;
  }

  const fix = await input.readChange(input.match);
  const candidates = await Promise.all(first.candidates.map((commit) => input.readChange(commit)));

  const picked = pickRangeFix({ ...pickInput, changes: { fix, candidates } });

  return picked.kind === 'found' ? picked.commit : null;
}

// the files a review left out for one lens: every file no call read, and each file the call of that
// lens left out while another call read it
function collectLensSkipped(
  notReviewed: ReadonlySet<string>,
  byLens: readonly LensNotReviewedPath[],
  lens: string,
): Set<string> {
  return new Set([
    ...notReviewed,
    ...byLens.filter((file) => file.lenses.includes(lens)).map((file) => file.path),
  ]);
}

interface FixFiles {
  evidence: FixFileEvidence | null;

  // why GitHub gave no whole file list of the commit or of the pull request
  failure: string | null;
}

// what the fix commit's files show against the pull request's diff, with each rename's earlier path
// on both sides, or why GitHub gave no whole list to judge them by
function buildFixFiles(read: CommitFiles, fixCommits: FixCommits, findingPath: string): FixFiles {
  if (read.failure !== null) {
    return { evidence: null, failure: read.failure };
  }

  if (fixCommits.pullRequestFiles === null) {
    return { evidence: null, failure: 'the pull request changes more files than GitHub lists' };
  }

  const evidence = buildFixFileEvidence({
    commitFiles: read.files.flatMap((file) =>
      file.previous_filename === undefined
        ? [file.filename]
        : [file.filename, file.previous_filename],
    ),
    pullRequestFiles: fixCommits.pullRequestFiles,
    findingPath,
  });

  return { evidence, failure: null };
}
