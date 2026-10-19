import type { Endpoints } from '@octokit/types';
import { collectRangeFiles } from './collect-range-files';

interface CompareCommit {
  sha: string;
  files: string[];
  renames: Record<string, string>;
}

type Compare = Endpoints['GET /repos/{owner}/{repo}/compare/{basehead}']['response']['data'];

// the fields of GitHub's compare that the adapter reads, typed from the endpoint
export interface CompareData {
  status: Extract<Compare['status'], 'ahead' | 'behind' | 'identical'>;
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

// the most commits GitHub's compare lists without page parameters
const UNPAGED_COMMITS = 250;

// GitHub's compare of 2 commits of one line of history, oldest first: the base is an ancestor of the
// head when it comes first, and the merge base is then the base itself; a full sha with no commit is
// the pull request's own base, before every commit, and a shorter one names no commit, so gives null
export function buildCompareData(
  records: readonly CompareCommit[],
  request: CompareRequest,
): CompareData | null {
  const base = request.base;
  const head = request.head;
  const commits = records.map((commit) => commit.sha);
  const at = commits.findIndex((sha) => sha.startsWith(base));

  if (at === -1 && base.length < 40) {
    return null;
  }

  const found = commits.indexOf(head);
  const end = found === -1 ? commits.length : found + 1;
  const range = records.slice(at + 1, end);
  const status = pickStatus(at + 1, end);

  return {
    status,
    merge_base_commit: { sha: status === 'behind' ? head : (commits[at] ?? base) },
    commits: pickPage(range, request.search).map((commit) => ({ sha: commit.sha })),
    files: collectRangeFiles(range),
  };
}

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
