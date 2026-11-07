import type { Finding, ReviewResult } from '@noslop/contract';
import type { UnpostedInput } from './collect-unposted-findings';
import { collectUnpostedFindings } from './collect-unposted-findings';
import type { SummaryMarker } from './summary-marker';

export interface PostPrior extends UnpostedInput {
  summary: SummaryMarker | null;
}

export interface PostPlan {
  writesSummary: boolean;
  reviewIDs: string[];
  inline: Finding[];
  carried: Finding[];
}

export function planReviewPost(prior: PostPrior, result: ReviewResult): PostPlan {
  const postedIDs = prior.summary?.reviewIDs ?? [];
  const isRepost = postedIDs.includes(result.reviewID);
  const isLatest = postedIDs.at(-1) === result.reviewID;

  if ((isRepost && !isLatest) || (!isRepost && isEarlier(result, prior.summary))) {
    return { writesSummary: false, reviewIDs: postedIDs, inline: [], carried: [] };
  }

  return {
    writesSummary: true,
    reviewIDs: isRepost ? postedIDs : [...postedIDs, result.reviewID],
    inline: result.findings.filter((finding) => !prior.posted.has(finding.id)),
    carried: collectUnpostedFindings(prior, result),
  };
}

function isEarlier(result: ReviewResult, summary: SummaryMarker | null): boolean {
  if (summary?.startedAt === undefined) {
    return false;
  }

  return Date.parse(result.startedAt) < Date.parse(summary.startedAt);
}
