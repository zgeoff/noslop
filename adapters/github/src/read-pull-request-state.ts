import type { PullRequestRef } from '@noslop/contract';
import { z } from 'zod';
import type { GitHubConnection } from './create-github-connection';
import type { FindingMarker } from './finding-marker';
import { findingMarkerSchema } from './finding-marker';
import { formatFindingHeading } from './format-finding-heading';
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

export interface FindingThread {
  source: 'review' | 'issue';
  commentID: number;

  body: string;
  marker: FindingMarker;

  line: number | null;
  startLine: number | null;
  replies: Reply[];

  answered: Set<number>;
}

export interface PullRequestState {
  title: string;
  body: string;
  author: string;

  baseRef: string;
  baseSha: string;
  headSha: string;
  threads: FindingThread[];
  summary: { commentID: number; marker: SummaryMarker } | null;

  unreadable: number;
}

const formsMarkerSchema = z.strictObject({ replyID: z.int() });
const FINDING_MARKER_START = '<!-- noslop:finding ';

interface GitHubComment {
  id: number | bigint;
  user?: { login: string } | null;
  created_at?: string;
}

export async function readPullRequestState(
  connection: GitHubConnection,
  pr: PullRequestRef,
): Promise<PullRequestState> {
  const client = connection.client;
  const params = { owner: pr.owner, repo: pr.repo };

  const pull = await client.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
    ...params,
    pull_number: pr.number,
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

  const isOwn = (comment: GitHubComment) =>
    connection.appLogin !== null && comment.user?.login === connection.appLogin;

  const threads = new Map<number, FindingThread>();
  const byFindingID = new Map<string, FindingThread>();

  let unreadable = 0;

  for (const comment of reviewComments) {
    const marker = isOwn(comment)
      ? parseMarker('finding', findingMarkerSchema, comment.body)
      : null;

    if (isOwn(comment) && marker === null && comment.body.includes(FINDING_MARKER_START)) {
      unreadable += 1;
    }

    if (marker !== null && comment.in_reply_to_id === undefined) {
      const line = comment.original_line ?? comment.line ?? null;
      const startLine = comment.original_start_line ?? comment.start_line ?? line;

      const thread = buildThread({
        source: 'review',
        commentID: Number(comment.id),
        body: comment.body,
        marker,
        line,
        startLine,
      });

      threads.set(Number(comment.id), thread);

      for (const item of [thread, ...buildFoldedThreads(thread)]) {
        byFindingID.set(item.marker.id, item);
      }
    }
  }

  for (const comment of reviewComments) {
    const thread = threads.get(comment.in_reply_to_id ?? -1);

    if (thread === undefined) {
      continue;
    }

    if (!isOwn(comment)) {
      thread.replies.push(toReply(comment, comment.body));
      continue;
    }

    const forms = parseMarker('forms', formsMarkerSchema, comment.body);

    if (forms !== null) {
      thread.answered.add(forms.replyID);
    }
  }

  let summary: PullRequestState['summary'] = null;

  const answeredInIssue = new Set<number>();

  const issueReplies: { id: string; reply: Reply }[] = [];

  for (const comment of issueComments) {
    const body = comment.body ?? '';

    if (isOwn(comment)) {
      const marker = parseMarker('finding', findingMarkerSchema, body);
      const summaryMarker = parseMarker('summary', summaryMarkerSchema, body);
      const forms = parseMarker('forms', formsMarkerSchema, body);

      if (marker === null && body.includes(FINDING_MARKER_START)) {
        unreadable += 1;
      }

      if (marker !== null) {
        const thread = buildThread({
          source: 'issue',
          commentID: Number(comment.id),
          body,
          marker,
          line: null,
          startLine: null,
        });

        for (const item of [thread, ...buildFoldedThreads(thread)]) {
          byFindingID.set(item.marker.id, item);
        }
      }

      if (summaryMarker !== null) {
        summary = { commentID: Number(comment.id), marker: summaryMarker };
      }

      if (forms !== null) {
        answeredInIssue.add(forms.replyID);
      }

      continue;
    }

    const match = /^(?<id>[0-9a-f]{16})\s+(?<reply>.+)$/su.exec(body.trim());
    const id = match?.groups?.['id'];
    const reply = match?.groups?.['reply'];

    if (id !== undefined && reply !== undefined) {
      issueReplies.push({ id, reply: toReply(comment, reply) });
    }
  }

  for (const item of issueReplies) {
    const thread = byFindingID.get(item.id);

    if (thread?.source === 'issue') {
      thread.replies.push(item.reply);
    }
  }

  for (const thread of byFindingID.values()) {
    if (thread.source === 'issue') {
      for (const replyID of answeredInIssue) {
        thread.answered.add(replyID);
      }
    }
  }

  return {
    title: pull.data.title,
    body: pull.data.body ?? '',
    author: pull.data.user.login,
    baseRef: pull.data.base.ref,
    baseSha: pull.data.base.sha,
    headSha: pull.data.head.sha,
    threads: [...byFindingID.values()],
    summary,
    unreadable,
  };
}

type PostedFinding = Pick<
  FindingThread,
  'source' | 'commentID' | 'body' | 'marker' | 'line' | 'startLine'
>;

function buildThread(posted: PostedFinding): FindingThread {
  return { ...posted, replies: [], answered: new Set() };
}

function buildFoldedThreads(lead: FindingThread): FindingThread[] {
  const { folded = [], ...marker } = lead.marker;

  return folded.map((finding) => ({
    source: lead.source,
    commentID: lead.commentID,
    body: [
      formatFindingHeading(marker.severity, marker.lens, finding.title),
      '',
      finding.body,
      ...(finding.fix === null ? [] : ['', `**Fix:** ${finding.fix}`]),
    ].join('\n'),
    replies: lead.replies,
    answered: lead.answered,
    marker: {
      ...marker,
      id: finding.id,
      title: finding.title,
      path: finding.path,
      riskClass: finding.riskClass,
      writtenByChange: finding.writtenByChange,
    },
    line: lead.source === 'review' ? finding.line : null,
    startLine: lead.source === 'review' ? finding.startLine : null,
  }));
}

function toReply(comment: GitHubComment, body: string): Reply {
  return {
    id: Number(comment.id),
    body,
    author: comment.user?.login ?? '',
    at: comment.created_at ?? new Date(0).toISOString(),
  };
}
