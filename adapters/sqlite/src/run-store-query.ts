import type { RawBuilder } from 'kysely';
import { sql } from 'kysely';
import type { Store } from './load-store';

export const STORE_QUERY_NAMES = [
  'yield-by-lens',
  'yield-by-depth',
  'open-findings',
  'cost-by-depth',
  'recall-by-lens',
  'recall-by-depth',
  'dropped-findings',
  'findings-by-pr',
] as const;

export type StoreQueryName = (typeof STORE_QUERY_NAMES)[number];

// the reviews a query reads; only `findings-by-pr` reads them, and an absent filter keeps every review
export interface StoreQueryFilters {
  repo?: string;
  pullRequest?: number;

  // an ISO time; a review that ended before it is left out
  since?: string;
}

// each finding of a repo counts once, under its latest disposition, and at the depth of the first
// review that reported it; 2 reviews of one change that report one defect share its ID; a review
// that ends after a `fixed` disposition and still reports the finding reopens it
const OUTCOMES = sql`
  latest AS (
    SELECT repo, finding_id, kind, at FROM (
      SELECT repo, finding_id, kind, at,
        ROW_NUMBER() OVER (PARTITION BY repo, finding_id ORDER BY at DESC) AS position
      FROM dispositions
    ) WHERE position = 1
  ),
  seen AS (
    SELECT repo, finding_id, lens, depth, last_seen FROM (
      SELECT reviews.repo AS repo, findings.finding_id AS finding_id,
        MIN(findings.lens) OVER finding AS lens,
        MAX(reviews.ended_at) OVER finding AS last_seen,
        findings.depth AS depth,
        ROW_NUMBER() OVER (finding ORDER BY reviews.ended_at, reviews.review_id) AS position
      FROM findings JOIN reviews USING (review_id)
      WINDOW finding AS (PARTITION BY reviews.repo, findings.finding_id)
    ) WHERE position = 1
  ),
  outcomes AS (
    SELECT seen.repo AS repo, seen.finding_id AS finding_id, seen.lens AS lens, seen.depth AS depth,
      CASE
        WHEN latest.kind IS NULL THEN 'open'
        WHEN latest.kind = 'fixed' AND seen.last_seen > latest.at THEN 'open'
        ELSE latest.kind
      END AS kind
    FROM seen LEFT JOIN latest USING (repo, finding_id)
  )`;

const QUERIES: Record<
  StoreQueryName,
  (filters: StoreQueryFilters) => RawBuilder<Record<string, unknown>>
> = {
  // the share of each lens's findings that end fixed, and the share that end not a defect
  'yield-by-lens': () => sql`
    WITH ${OUTCOMES}
    SELECT
      lens,
      COUNT(*) AS findings,
      SUM(kind = 'fixed') AS fixed,
      SUM(kind = 'not-a-defect') AS "notADefect",
      SUM(kind = 'open') AS open,
      ROUND(1.0 * SUM(kind = 'fixed') / COUNT(*), 3) AS yield,
      ROUND(1.0 * SUM(kind = 'not-a-defect') / COUNT(*), 3) AS noise
    FROM outcomes
    GROUP BY lens
    ORDER BY lens`,

  // the same shares at each depth, by the depth of the first review that reported each finding
  'yield-by-depth': () => sql`
    WITH ${OUTCOMES}
    SELECT
      depth,
      COUNT(*) AS findings,
      SUM(kind = 'fixed') AS fixed,
      SUM(kind = 'not-a-defect') AS "notADefect",
      SUM(kind = 'open') AS open,
      ROUND(1.0 * SUM(kind = 'fixed') / COUNT(*), 3) AS yield,
      ROUND(1.0 * SUM(kind = 'not-a-defect') / COUNT(*), 3) AS noise
    FROM outcomes
    GROUP BY depth
    ORDER BY depth`,

  // each open finding of each change's latest review, the most severe first; a pull request is one
  // change, and a local branch, which has no pull request, is one change per base
  'open-findings': () => sql`
    WITH ${OUTCOMES},
    last_reviews AS (
      SELECT review_id FROM (
        SELECT review_id, ROW_NUMBER() OVER (
          PARTITION BY repo, COALESCE(CAST(pull_request AS TEXT), base) ORDER BY ended_at DESC
        ) AS position
        FROM reviews
      ) WHERE position = 1
    )
    SELECT
      reviews.repo AS repo,
      reviews.pull_request AS "pullRequest",
      reviews.head AS head,
      findings.finding_id AS id,
      findings.lens AS lens,
      findings.severity AS severity,
      findings.verdict AS verdict,
      findings.title AS title,
      findings.path AS path,
      findings.start_line AS "startLine"
    FROM findings
    JOIN last_reviews USING (review_id)
    JOIN reviews USING (review_id)
    JOIN outcomes ON outcomes.repo = reviews.repo AND outcomes.finding_id = findings.finding_id
    WHERE outcomes.kind = 'open'
    ORDER BY findings.severity, reviews.repo, findings.path, findings.start_line`,

  // what the calls at each depth cost, from the calls table
  'cost-by-depth': () => sql`
    SELECT
      depth,
      COUNT(*) AS calls,
      SUM(status = 'failed') AS failed,
      SUM(input_tokens) AS "inputTokens",
      SUM(cached_input_tokens) AS "cachedInputTokens",
      SUM(cache_write_tokens) AS "cacheWriteTokens",
      SUM(output_tokens) AS "outputTokens",
      ROUND(AVG(duration_ms)) AS "meanDurationMs"
    FROM calls
    GROUP BY depth
    ORDER BY depth`,

  // each escape, with whether its lens ran on the change that caused it and what that lens reported
  'recall-by-lens': () => sql`
    SELECT
      escapes.lens AS lens,
      COUNT(*) AS escapes,
      SUM(EXISTS (
        SELECT 1 FROM reviews
        WHERE reviews.repo = escapes.repo AND reviews.head = escapes.head
          AND ${buildLensRan(sql.ref('reviews.review_id'), sql.ref('reviews.lenses'), sql.ref('escapes.lens'))}
      )) AS "lensRan",
      SUM(EXISTS (
        SELECT 1 FROM findings JOIN reviews USING (review_id)
        WHERE reviews.repo = escapes.repo AND reviews.head = escapes.head
          AND findings.lens = escapes.lens
          AND (escapes.path IS NULL OR findings.path = escapes.path)
      )) AS "lensReported"
    FROM escapes
    GROUP BY escapes.lens
    ORDER BY escapes.lens`,

  // each escape at the depth of the latest review of the change that caused it, with whether its lens
  // ran there and reported on its file; an escape on a change no review saw has no depth
  'recall-by-depth': () => sql`
    WITH reviewed AS (
      SELECT escapes.*, (
        SELECT reviews.review_id FROM reviews
        WHERE reviews.repo = escapes.repo AND reviews.head = escapes.head
        ORDER BY reviews.ended_at DESC, reviews.review_id DESC LIMIT 1
      ) AS review_id
      FROM escapes
    )
    SELECT
      reviews.depth AS depth,
      COUNT(*) AS escapes,
      SUM(${buildLensRan(sql.ref('reviews.review_id'), sql.ref('reviews.lenses'), sql.ref('reviewed.lens'))}) AS "lensRan",
      SUM(EXISTS (
        SELECT 1 FROM findings
        WHERE findings.review_id = reviewed.review_id AND findings.lens = reviewed.lens
          AND (reviewed.path IS NULL OR findings.path = reviewed.path)
      )) AS "lensReported"
    FROM reviewed LEFT JOIN reviews USING (review_id)
    GROUP BY reviews.depth
    ORDER BY reviews.depth`,

  // each finding Assemble dropped, newest review first, with the rule and quote a taste finding cited,
  // so a reader can check a quote the rules file did not hold against the file
  'dropped-findings': () => sql`
    SELECT
      reviews.repo AS repo,
      reviews.pull_request AS "pullRequest",
      reviews.head AS head,
      dropped_findings.lens AS lens,
      dropped_findings.reason AS reason,
      dropped_findings.title AS title,
      dropped_findings.path AS path,
      dropped_findings.start_line AS "startLine",
      dropped_findings.rule AS rule,
      dropped_findings.rule_quote AS "ruleQuote"
    FROM dropped_findings JOIN reviews USING (review_id)
    ORDER BY reviews.ended_at DESC, reviews.review_id, dropped_findings.rowid`,

  // each finding of each pull request once, as the latest review of the pull request that reported it
  // gave it, with the kind and value of the finding's latest disposition; the kind is the reply as
  // given, so a `fixed` finding that a later review reports again stays `fixed` here
  'findings-by-pr': (filters) => sql`
    WITH latest AS (
      SELECT repo, finding_id, kind, value FROM (
        SELECT repo, finding_id, kind, value,
          ROW_NUMBER() OVER (PARTITION BY repo, finding_id ORDER BY at DESC) AS position
        FROM dispositions
      ) WHERE position = 1
    ),
    reported AS (
      SELECT * FROM (
        SELECT reviews.repo AS repo, reviews.pull_request AS pull_request, reviews.head AS head,
          findings.*,
          ROW_NUMBER() OVER (
            PARTITION BY reviews.repo, reviews.pull_request, findings.finding_id
            ORDER BY reviews.ended_at DESC, reviews.review_id DESC
          ) AS position
        FROM findings JOIN reviews USING (review_id)
        WHERE reviews.pull_request IS NOT NULL
          AND (${filters.repo ?? null} IS NULL OR reviews.repo = ${filters.repo ?? null})
          AND (${filters.pullRequest ?? null} IS NULL
            OR reviews.pull_request = ${filters.pullRequest ?? null})
          AND (${filters.since ?? null} IS NULL OR reviews.ended_at >= ${filters.since ?? null})
      ) WHERE position = 1
    )
    SELECT
      reported.repo AS repo,
      reported.pull_request AS "pullRequest",
      reported.head AS head,
      reported.finding_id AS id,
      reported.path AS path,
      reported.start_line AS "startLine",
      reported.severity AS severity,
      reported.lens AS lens,
      reported.rule AS rule,
      reported.title AS title,
      latest.kind AS "dispositionKind",
      latest.value AS "dispositionValue"
    FROM reported LEFT JOIN latest USING (repo, finding_id)
    ORDER BY reported.repo, reported.pull_request, reported.severity, reported.path,
      reported.start_line, reported.finding_id`,
};

// runs one of the store's named queries; a reader pins the CLI version and reads the same row shape
export async function runStoreQuery(
  store: Store,
  name: StoreQueryName,
  filters: StoreQueryFilters = {},
): Promise<Record<string, unknown>[]> {
  const result = await QUERIES[name](filters).execute(store);

  return result.rows;
}

// whether a lens ran in a review: the review lists the routed lenses its calls ran, and a lens that
// routing never picks, such as the design lens, shows only in the lenses of the call that carried it
function buildLensRan(
  reviewID: RawBuilder<unknown>,
  reviewLenses: RawBuilder<unknown>,
  lens: RawBuilder<unknown>,
): RawBuilder<unknown> {
  return sql`(
    EXISTS (SELECT 1 FROM json_each(${reviewLenses}) AS ran WHERE ran.value = ${lens})
    OR EXISTS (
      SELECT 1 FROM calls, json_each(calls.lenses) AS ran
      WHERE calls.review_id = ${reviewID} AND ran.value = ${lens}
    )
  )`;
}
