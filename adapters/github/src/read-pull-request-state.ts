import type { PullRequestRef } from '@noslop/contract';
import { z } from 'zod';
import type { GitHubClient } from './create-github-client';
import type { FindingMarker } from './finding-marker';
import { findingMarkerSchema } from './finding-marker';
import { parseMarker } from './parse-marker';
import { readAllPages } from './read-all-pages';
import type { SummaryMarker } from './summary-marker';
import { summaryMarkerSchema } from './summary-marker';

export interface Reply {
  id: number;
  body: string;
  author: string;
  at: string;
}

// one posted finding and the people's replies to it; a finding GitHub could not anchor in the diff
// sits in an issue comment, and a reply to it is an issue comment whose first line starts with its id
export interface FindingThread {
  source: 'review' | 'issue';
  commentID: number;
  marker: FindingMarker;
  replies: Reply[];

  // the replies noslop already answered with the accepted forms
  answered: Set<number>;
}

export interface PullRequestState {
  title: string;
  body: string;
  baseSha: string;
  headSha: string;
  commits: string[];
  threads: FindingThread[];
  summary: { commentID: number; marker: SummaryMarker } | null;
}

const formsMarkerSchema = z.strictObject({ replyID: z.int() });

// everything noslop keeps on a pull request, read back from GitHub: its commits, each finding thread
// with its replies, and the summary of the latest review; a comment by a bot is noslop's own only when
// it holds a marker
export async function readPullRequestState(
  client: GitHubClient,
  pr: PullRequestRef,
): Promise<PullRequestState> {
  const params = { owner: pr.owner, repo: pr.repo };

  const pull = await client.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
    ...params,
    pull_number: pr.number,
  });

  const commits = await readAllPages(async (page, perPage) => {
    const response = await client.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/commits', {
      ...params,
      pull_number: pr.number,
      page,
      per_page: perPage,
    });

    return response.data;
  });

  const reviewComments = await readAllPages(async (page, perPage) => {
    const response = await client.request(
      'GET /repos/{owner}/{repo}/pulls/{pull_number}/comments',
      { ...params, pull_number: pr.number, page, per_page: perPage },
    );

    return response.data;
  });

  const issueComments = await readAllPages(async (page, perPage) => {
    const response = await client.request(
      'GET /repos/{owner}/{repo}/issues/{issue_number}/comments',
      { ...params, issue_number: pr.number, page, per_page: perPage },
    );

    return response.data;
  });

  const threads = new Map<number, FindingThread>();
  const byFindingID = new Map<string, FindingThread>();

  for (const comment of reviewComments) {
    const marker = isBot(comment.user)
      ? parseMarker('finding', findingMarkerSchema, comment.body)
      : null;

    if (marker !== null && comment.in_reply_to_id === undefined) {
      const thread = buildThread('review', Number(comment.id), marker);

      threads.set(Number(comment.id), thread);
      byFindingID.set(marker.id, thread);
    }
  }

  for (const comment of reviewComments) {
    const thread = threads.get(comment.in_reply_to_id ?? -1);

    if (thread === undefined) {
      continue;
    }

    if (!isBot(comment.user)) {
      thread.replies.push(toReply(comment, comment.body));
      continue;
    }

    const forms = parseMarker('forms', formsMarkerSchema, comment.body);

    if (forms !== null) {
      thread.answered.add(forms.replyID);
    }
  }

  let summary: PullRequestState['summary'] = null;

  for (const comment of issueComments) {
    const body = comment.body ?? '';

    if (isBot(comment.user)) {
      const marker = parseMarker('finding', findingMarkerSchema, body);
      const summaryMarker = parseMarker('summary', summaryMarkerSchema, body);

      if (marker !== null) {
        byFindingID.set(marker.id, buildThread('issue', Number(comment.id), marker));
      }

      if (summaryMarker !== null) {
        summary = { commentID: Number(comment.id), marker: summaryMarker };
      }

      continue;
    }

    const match = /^(?<id>[0-9a-f]{16})\s+(?<reply>.+)$/su.exec(body.trim());
    const thread = byFindingID.get(match?.groups?.['id'] ?? '');
    const reply = match?.groups?.['reply'];

    if (thread?.source === 'issue' && reply !== undefined) {
      thread.replies.push(toReply(comment, reply));
    }
  }

  return {
    title: pull.data.title,
    body: pull.data.body ?? '',
    baseSha: pull.data.base.sha,
    headSha: pull.data.head.sha,
    commits: commits.map((commit) => commit.sha),
    threads: [...byFindingID.values()],
    summary,
  };
}

function buildThread(
  source: FindingThread['source'],
  commentID: number,
  marker: FindingMarker,
): FindingThread {
  return { source, commentID, marker, replies: [], answered: new Set() };
}

function isBot(user: { type?: string } | null | undefined): boolean {
  return user?.type === 'Bot';
}

interface GitHubComment {
  id: number | bigint;
  user?: { login: string } | null;
  created_at?: string;
}

function toReply(comment: GitHubComment, body: string): Reply {
  return {
    id: Number(comment.id),
    body,
    author: comment.user?.login ?? '',
    at: comment.created_at ?? new Date(0).toISOString(),
  };
}
