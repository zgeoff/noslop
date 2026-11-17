import type { Endpoints } from '@octokit/types';
import { collectRangeFiles } from './collect-range-files';

interface CompareCommit {
  sha: string;
  files: string[];
  renames: Record<string, string>;

  isOnBranch: boolean;
}

type Compare = Endpoints['GET /repos/{owner}/{repo}/compare/{basehead}']['response']['data'];

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

  search: URLSearchParams;
}

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

function pickStatus(start: number, end: number): CompareData['status'] {
  if (start === end) {
    return 'identical';
  }

  return start < end ? 'ahead' : 'behind';
}

// the most commits GitHub's compare lists without page parameters
const UNPAGED_COMMITS = 250;

function pickPage<Item>(items: readonly Item[], search: URLSearchParams): Item[] {
  if (!search.has('page') && !search.has('per_page')) {
    return items.slice(0, UNPAGED_COMMITS);
  }

  const page = Number(search.get('page') ?? '1');
  const perPage = Number(search.get('per_page') ?? '30');

  return items.slice((page - 1) * perPage, page * perPage);
}
