import type { Finding, ReviewResult } from '@noslop/contract';
import type { UnpostedInput } from './collect-unposted-findings';
import { collectUnpostedFindings } from './collect-unposted-findings';
import type { SummaryMarker } from './summary-marker';

export interface PostPrior extends UnpostedInput {
  summary: SummaryMarker | null;
  followUpIDs: ReadonlySet<string>;
}

export interface PostPlan {
  writesSummary: boolean;
  reviews: number;
  reviewIDs: string[];
  inline: Finding[];
  carried: Finding[];
  carriedFiled: string[];
  followUps: Finding[];
}

const RECHECKED_REVIEWS = 2;

export function planReviewPost(prior: PostPrior, result: ReviewResult): PostPlan {
  const counted = prior.summary?.reviewIDs ?? [];
  const isRepost = counted.includes(result.reviewID);
  const isLatest = counted.at(-1) === result.reviewID;

  if ((isRepost && !isLatest) || (!isRepost && isEarlier(result, prior.summary))) {
    return {
      writesSummary: false,
      reviews: prior.summary?.reviews ?? 0,
      reviewIDs: counted,
      inline: [],
      carried: [],
      carriedFiled: [],
      followUps: [],
    };
  }

  const isRound =
    !isRepost &&
    result.fixesOnly !== true &&
    (result.lenses.length > 0 || result.findings.length > 0);

  const reviews = (prior.summary?.reviews ?? 0) + (isRound ? 1 : 0);
  const fresh = result.findings.filter((finding) => !prior.posted.has(finding.id));
  const unposted = collectUnpostedFindings(prior, result);

  const followUps =
    reviews > RECHECKED_REVIEWS
      ? fresh.filter((finding) => finding.lens !== 'security' && !finding.writtenByChange)
      : [];

  return {
    writesSummary: true,
    reviews,
    reviewIDs: isRepost ? counted : [...counted, result.reviewID],
    inline: fresh.filter((finding) => !followUps.includes(finding)),
    carried: unposted.filter((finding) => !prior.followUpIDs.has(finding.id)),
    carriedFiled: unposted
      .filter((finding) => prior.followUpIDs.has(finding.id))
      .map((finding) => finding.id),
    followUps,
  };
}

function isEarlier(result: ReviewResult, summary: SummaryMarker | null): boolean {
  if (summary?.startedAt === undefined) {
    return false;
  }

  return Date.parse(result.startedAt) < Date.parse(summary.startedAt);
}
