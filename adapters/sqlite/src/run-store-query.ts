import type { RawBuilder } from 'kysely';
import { sql } from 'kysely';
import type { Store } from './load-store';

export const STORE_QUERY_NAMES = [
  'yield-by-lens',
  'open-findings',
  'cost-by-depth',
  'recall-by-lens',
] as const;

export type StoreQueryName = (typeof STORE_QUERY_NAMES)[number];

// each finding counts once, under its latest disposition; a finding that 2 reviews of one change
// report shares its ID, so the queries count distinct IDs
const LATEST = sql`
  latest AS (
    SELECT finding_id, kind FROM (
      SELECT finding_id, kind, ROW_NUMBER() OVER (PARTITION BY finding_id ORDER BY at DESC) AS position
      FROM dispositions
    ) WHERE position = 1
  )`;

const QUERIES: Record<StoreQueryName, RawBuilder<Record<string, unknown>>> = {
  // the share of each lens's findings that end fixed, and the share that end not a defect
  'yield-by-lens': sql`
    WITH ${LATEST},
    unique_findings AS (SELECT DISTINCT finding_id, lens FROM findings),
    outcomes AS (
      SELECT unique_findings.lens AS lens, COALESCE(latest.kind, 'open') AS kind
      FROM unique_findings LEFT JOIN latest USING (finding_id)
    )
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

  // each finding of each repo's latest review that holds no disposition, the most severe first
  'open-findings': sql`
    WITH ${LATEST},
    last_reviews AS (
      SELECT review_id FROM (
        SELECT review_id, ROW_NUMBER() OVER (
          PARTITION BY repo, COALESCE(pull_request, head) ORDER BY ended_at DESC
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
    LEFT JOIN latest USING (finding_id)
    WHERE latest.kind IS NULL
    ORDER BY findings.severity, reviews.repo, findings.path, findings.start_line`,

  // what the calls at each depth cost, from the calls table
  'cost-by-depth': sql`
    SELECT
      depth,
      COUNT(*) AS calls,
      SUM(status = 'failed') AS failed,
      SUM(input_tokens) AS "inputTokens",
      SUM(output_tokens) AS "outputTokens",
      ROUND(AVG(duration_ms)) AS "meanDurationMs"
    FROM calls
    GROUP BY depth
    ORDER BY depth`,

  // each escape, with whether its lens ran on the change that caused it and what that lens reported
  'recall-by-lens': sql`
    SELECT
      escapes.lens AS lens,
      COUNT(*) AS escapes,
      SUM(EXISTS (
        SELECT 1 FROM reviews, json_each(reviews.lenses) AS ran
        WHERE reviews.repo = escapes.repo AND reviews.head = escapes.head AND ran.value = escapes.lens
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
};

// runs one of the store's named queries; a reader pins the CLI version and reads the same row shape
export async function runStoreQuery(
  store: Store,
  name: StoreQueryName,
): Promise<Record<string, unknown>[]> {
  const result = await QUERIES[name].execute(store);

  return result.rows;
}
