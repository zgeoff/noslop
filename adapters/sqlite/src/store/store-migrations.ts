import { sql } from 'kysely';
import type { Migration } from 'kysely/migration';

export const STORE_MIGRATIONS: Record<string, Migration> = {
  '0001-the-store': {
    up: async (db) => {
      await db.schema
        .createTable('reviews')
        .addColumn('review_id', 'text', (column) => column.primaryKey())
        .addColumn('repo', 'text', (column) => column.notNull())
        .addColumn('pull_request', 'integer')
        .addColumn('base', 'text', (column) => column.notNull())
        .addColumn('head', 'text', (column) => column.notNull())
        .addColumn('title', 'text')
        .addColumn('depth', 'text', (column) => column.notNull())
        .addColumn('stepped_up_from', 'text')
        .addColumn('special', 'text')
        .addColumn('risk_classes', 'text', (column) => column.notNull())
        .addColumn('lenses', 'text', (column) => column.notNull())
        .addColumn('config_hash', 'text', (column) => column.notNull())
        .addColumn('started_at', 'text', (column) => column.notNull())
        .addColumn('ended_at', 'text', (column) => column.notNull())
        .execute();

      await db.schema
        .createTable('calls')
        .addColumn('review_id', 'text', (column) =>
          column.notNull().references('reviews.review_id').onDelete('cascade'),
        )
        .addColumn('call_id', 'text', (column) => column.notNull())
        .addColumn('lenses', 'text', (column) => column.notNull())
        .addColumn('depth', 'text', (column) => column.notNull())
        .addColumn('adapter', 'text', (column) => column.notNull())
        .addColumn('model', 'text')
        .addColumn('effort', 'text', (column) => column.notNull())
        .addColumn('chunk', 'integer')
        .addColumn('status', 'text', (column) => column.notNull())
        .addColumn('attempts', 'integer', (column) => column.notNull())
        .addColumn('input_tokens', 'integer', (column) => column.notNull())
        .addColumn('output_tokens', 'integer', (column) => column.notNull())
        .addColumn('duration_ms', 'integer', (column) => column.notNull())
        .addPrimaryKeyConstraint('calls_pk', ['review_id', 'call_id'])
        .execute();

      await db.schema
        .createTable('findings')
        .addColumn('review_id', 'text', (column) =>
          column.notNull().references('reviews.review_id').onDelete('cascade'),
        )
        .addColumn('finding_id', 'text', (column) => column.notNull())
        .addColumn('lens', 'text', (column) => column.notNull())
        .addColumn('call_id', 'text')
        .addColumn('title', 'text', (column) => column.notNull())
        .addColumn('body', 'text', (column) => column.notNull())
        .addColumn('path', 'text', (column) => column.notNull())
        .addColumn('start_line', 'integer', (column) => column.notNull())
        .addColumn('end_line', 'integer', (column) => column.notNull())
        .addColumn('second_location', 'text')
        .addColumn('severity', 'text', (column) => column.notNull())
        .addColumn('criterion', 'text', (column) => column.notNull())
        .addColumn('rule', 'text')
        .addColumn('verdict', 'text', (column) => column.notNull())
        .addColumn('unverified_fact', 'text')
        .addColumn('written_by_change', 'integer', (column) => column.notNull())
        .addColumn('risk_class', 'text')
        .addColumn('fix', 'text')
        .addColumn('depth', 'text', (column) => column.notNull())
        .addColumn('model', 'text')
        .addColumn('effort', 'text')
        .addPrimaryKeyConstraint('findings_pk', ['review_id', 'finding_id'])
        .execute();

      await db.schema
        .createTable('dispositions')
        .addColumn('finding_id', 'text', (column) => column.notNull())
        .addColumn('kind', 'text', (column) => column.notNull())
        .addColumn('value', 'text', (column) => column.notNull())
        .addColumn('author', 'text', (column) => column.notNull())
        .addColumn('author_is_owner', 'integer', (column) => column.notNull())
        .addColumn('source', 'text', (column) => column.notNull())
        .addColumn('at', 'text', (column) => column.notNull())
        .addPrimaryKeyConstraint('dispositions_pk', ['finding_id', 'source', 'at'])
        .execute();

      await db.schema
        .createTable('escapes')
        .addColumn('escape_id', 'text', (column) => column.primaryKey())
        .addColumn('repo', 'text', (column) => column.notNull())
        .addColumn('issue', 'text', (column) => column.notNull())
        .addColumn('head', 'text', (column) => column.notNull())
        .addColumn('lens', 'text')
        .addColumn('defect', 'text', (column) => column.notNull())
        .addColumn('path', 'text')
        .addColumn('start_line', 'integer')
        .addColumn('end_line', 'integer')
        .addColumn('recorded_at', 'text', (column) => column.notNull())
        .execute();

      await sql`CREATE INDEX findings_by_finding ON findings (finding_id)`.execute(db);
    },
  },

  '0002-dispositions-by-repo': {
    up: async (db) => {
      await db.schema
        .createTable('dispositions_by_repo')
        .addColumn('repo', 'text', (column) => column.notNull())
        .addColumn('finding_id', 'text', (column) => column.notNull())
        .addColumn('kind', 'text', (column) => column.notNull())
        .addColumn('value', 'text', (column) => column.notNull())
        .addColumn('author', 'text', (column) => column.notNull())
        .addColumn('author_is_owner', 'integer', (column) => column.notNull())
        .addColumn('source', 'text', (column) => column.notNull())
        .addColumn('at', 'text', (column) => column.notNull())
        .addPrimaryKeyConstraint('dispositions_pk', ['repo', 'finding_id', 'source', 'at'])
        .execute();

      await sql`
        INSERT INTO dispositions_by_repo
        SELECT
          COALESCE(
            (SELECT CASE WHEN COUNT(DISTINCT reviews.repo) = 1 THEN MIN(reviews.repo) END
              FROM findings JOIN reviews USING (review_id)
              WHERE findings.finding_id = dispositions.finding_id),
            ''
          ),
          finding_id, kind, value, author, author_is_owner, source, at
        FROM dispositions`.execute(db);

      await db.schema.dropTable('dispositions').execute();
      await sql`ALTER TABLE dispositions_by_repo RENAME TO dispositions`.execute(db);
    },
  },

  '0003-calls-without-chunks': {
    up: async (db) => {
      await db.schema.alterTable('calls').dropColumn('chunk').execute();
    },
  },

  '0004-calls-with-cache-counts': {
    up: async (db) => {
      await db.schema
        .alterTable('calls')
        .addColumn('cached_input_tokens', 'integer', (column) => column.notNull().defaultTo(0))
        .execute();

      await db.schema
        .alterTable('calls')
        .addColumn('cache_write_tokens', 'integer', (column) => column.notNull().defaultTo(0))
        .execute();
    },
  },

  '0005-reviews-without-step-up': {
    up: async (db) => {
      await db.schema.alterTable('reviews').dropColumn('stepped_up_from').execute();
    },
  },

  '0006-dropped-findings': {
    up: async (db) => {
      await db.schema
        .createTable('dropped_findings')
        .addColumn('review_id', 'text', (column) =>
          column.notNull().references('reviews.review_id').onDelete('cascade'),
        )
        .addColumn('lens', 'text', (column) => column.notNull())
        .addColumn('call_id', 'text')
        .addColumn('title', 'text', (column) => column.notNull())
        .addColumn('path', 'text', (column) => column.notNull())
        .addColumn('start_line', 'integer', (column) => column.notNull())
        .addColumn('end_line', 'integer', (column) => column.notNull())
        .addColumn('criterion', 'text', (column) => column.notNull())
        .addColumn('reason', 'text', (column) => column.notNull())
        .addColumn('rule', 'text')
        .addColumn('rule_quote', 'text')
        .execute();
    },
  },

  '0007-dispositions-by-pull-request': {
    up: async (db) => {
      await db.schema
        .createTable('dispositions_by_pull_request')
        .addColumn('repo', 'text', (column) => column.notNull())
        .addColumn('finding_id', 'text', (column) => column.notNull())
        .addColumn('kind', 'text', (column) => column.notNull())
        .addColumn('value', 'text', (column) => column.notNull())
        .addColumn('author', 'text', (column) => column.notNull())
        .addColumn('author_is_owner', 'integer', (column) => column.notNull())
        .addColumn('source', 'text', (column) => column.notNull())
        .addColumn('at', 'text', (column) => column.notNull())
        .addColumn('pull_request', 'integer')
        .execute();

      await sql`
        INSERT INTO dispositions_by_pull_request
        SELECT repo, finding_id, kind, value, author, author_is_owner, source, at, NULL
        FROM dispositions`.execute(db);

      await db.schema.dropTable('dispositions').execute();
      await sql`ALTER TABLE dispositions_by_pull_request RENAME TO dispositions`.execute(db);

      // SQLite treats each NULL in a unique index as distinct, so the key reads a missing pull
      // request as 0, which no pull request takes.
      await sql`
        CREATE UNIQUE INDEX dispositions_key
        ON dispositions (repo, COALESCE(pull_request, 0), finding_id, source, at)`.execute(db);
    },
  },

  '0008-findings-with-comment-urls': {
    up: async (db) => {
      await db.schema.alterTable('findings').addColumn('comment_url', 'text').execute();
    },
  },

  '0009-findings-with-anchor-commits': {
    up: async (db) => {
      await db.schema.alterTable('findings').addColumn('anchor_commit', 'text').execute();
    },
  },
};
