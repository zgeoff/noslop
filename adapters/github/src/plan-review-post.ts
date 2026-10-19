import type { Finding, ReviewResult } from '@noslop/contract';
import type { SummaryMarker } from './summary-marker';

// what the pull request already holds before a post: the summary marker of the latest review, and
// the id of each finding a comment or a follow-up issue already carries
export interface PostPrior {
  summary: SummaryMarker | null;
  posted: ReadonlySet<string>;
}

// a post either writes a review in full, or only sets the check again and leaves the later summary;
// a post that writes nothing posts no finding
export interface PostPlan {
  writesSummary: boolean;
  reviews: number;
  reviewIDs: string[];
  inline: Finding[];
  followUps: Finding[];
}

// a re-review after this many reviews of one pull request is past the one re-check
const RECHECKED_REVIEWS = 2;

// the post a result makes from what the pull request holds; a retry of a review that started before
// the one the summary shows, counted or not, only sets the check again, and a marker without a start
// time orders only the reviews it counted
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
      followUps: [],
    };
  }

  // a post of a result the summary already counted, such as a retry after a failed request, is the
  // same review, so it never moves a pull request toward the re-check limit; a fixes-only run is no
  // review round either
  const isFixesOnly = result.fixChecks !== undefined;
  const reviews = (prior.summary?.reviews ?? 0) + (isRepost || isFixesOnly ? 0 : 1);
  const fresh = result.findings.filter((finding) => !prior.posted.has(finding.id));

  const followUps =
    reviews > RECHECKED_REVIEWS
      ? fresh.filter((finding) => finding.lens !== 'security' && !finding.writtenByChange)
      : [];

  return {
    writesSummary: true,
    reviews,
    reviewIDs: isRepost ? counted : [...counted, result.reviewID],
    inline: fresh.filter((finding) => !followUps.includes(finding)),
    followUps,
  };
}

function isEarlier(result: ReviewResult, summary: SummaryMarker | null): boolean {
  if (summary?.startedAt === undefined) {
    return false;
  }

  return Date.parse(result.startedAt) < Date.parse(summary.startedAt);
}
