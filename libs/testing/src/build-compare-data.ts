import type { Endpoints } from '@octokit/types';
import { collectRangeFiles } from './collect-range-files';

interface CompareCommit {
  sha: string;
  files: string[];
  renames: Record<string, string>;

  // a commit off the branch, such as one a rebase replaced, keeps a line of history of its own
  isOnBranch: boolean;
}

type Compare = Endpoints['GET /repos/{owner}/{repo}/compare/{basehead}']['response']['data'];

// the fields of GitHub's compare that the adapter reads, typed from the endpoint
export interface CompareData {
  status: Extract<Compare['status'], 'ahead' | 'behind' | 'identical' | 'diverged'>;
  merge_base_commit: Pick<Compare['merge_base_commit'], 'sha'>;
  commits: Pick<Compare['commits'][number], 'sha'>[];
  files: (Pick<NonNullable<Compare['files']>[number], 'filename' | 'previous_filename'> & {
    status?: string;
  })[];
}

export interface CompareRequest {
  base: string;
  head: string;

  // the request's query, whose `page` and `per_page` page the commits
  search: URLSearchParams;
}

// GitHub's compare of 2 commits of one line of history, oldest first, where the merge base is the base
// when it comes first; a full sha with no commit is the pull request's own base, before every commit,
// a shorter one with no commit gives null, and one that starts 2 commits is ambiguous
export function buildCompareData(
  records: readonly CompareCommit[],
  request: CompareRequest,
): CompareData | 'ambiguous' | null {
  const base = request.base;
  const head = request.head;
  const matches = records.filter((commit) => commit.sha.startsWith(base));

  if (matches.length === 0 && base.length < 40) {
    return null;
  }

  if (base.length < 40 && matches.length > 1) {
    return 'ambiguous';
  }

  const isOnBranch = records.find((commit) => commit.sha === head)?.isOnBranch ?? true;
  const line = records.filter((commit) => commit.isOnBranch === isOnBranch);
  const commits = line.map((commit) => commit.sha);

  // a base on the other line has diverged from the head, so the compare lists the head's line
  const isDiverged = matches[0] !== undefined && matches[0].isOnBranch !== isOnBranch;
  const at = isDiverged ? -1 : commits.findIndex((sha) => sha.startsWith(base));
  const found = commits.indexOf(head);
  const end = found === -1 ? commits.length : found + 1;
  const range = line.slice(at + 1, end);
  const status = isDiverged ? 'diverged' : pickStatus(at + 1, end);

  return {
    status,
    merge_base_commit: { sha: status === 'behind' ? head : (commits[at] ?? base) },
    commits: pickPage(range, request.search).map((commit) => ({ sha: commit.sha })),
    files: collectRangeFiles(range),
  };
}

// the most commits GitHub's compare lists without page parameters
const UNPAGED_COMMITS = 250;

// a compare that asks for pages gets one page of the commits, and one that does not gets the first
// ones alone, as GitHub lists them
function pickPage<Item>(items: readonly Item[], search: URLSearchParams): Item[] {
  if (!search.has('page') && !search.has('per_page')) {
    return items.slice(0, UNPAGED_COMMITS);
  }

  const page = Number(search.get('page') ?? '1');
  const perPage = Number(search.get('per_page') ?? '30');

  return items.slice((page - 1) * perPage, page * perPage);
}

// the head's place against the first commit after the base
function pickStatus(start: number, end: number): CompareData['status'] {
  if (start === end) {
    return 'identical';
  }

  return start < end ? 'ahead' : 'behind';
}
