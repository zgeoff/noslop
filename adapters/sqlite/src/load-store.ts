import { Database } from 'bun:sqlite';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { SqliteDatabase, SqliteStatement } from 'kysely';
import { Kysely, SqliteDialect, sql } from 'kysely';
import type { Migration } from 'kysely/migration';
import { Migrator } from 'kysely/migration';
import type { StoreTables } from './store-tables';

export type Store = Kysely<StoreTables>;

// opens the store at the path, creating the file and its folder when they do not exist, and applies
// each migration it lacks; the caller destroys the store when it is done
export async function loadStore(path: string): Promise<Store> {
  await mkdir(dirname(path), { recursive: true });

  const database = new Database(path, { create: true, strict: true });

  database.run('PRAGMA journal_mode = WAL');
  database.run('PRAGMA foreign_keys = ON');

  const store = new Kysely<StoreTables>({
    dialect: new SqliteDialect({ database: buildSqliteDatabase(database) }),
  });

  const migrator = new Migrator({
    db: store,
    provider: { getMigrations: () => Promise.resolve(STORE_MIGRATIONS) },
  });

  const outcome = await migrator.migrateToLatest();

  if (outcome.error !== undefined) {
    await store.destroy();

    throw outcome.error instanceof Error
      ? outcome.error
      : new Error('a store migration failed', { cause: outcome.error });
  }

  return store;
}

// Kysely's SQLite dialect drives a database through the better-sqlite3 interface, which bun:sqlite
// matches except for the reader flag and its spread parameters
function buildSqliteDatabase(database: Database): SqliteDatabase {
  return {
    close: () => {
      database.close();
    },
    prepare: (text): SqliteStatement => {
      const statement = database.prepare(text);

      return {
        reader: statement.columnNames.length > 0,
        all: (parameters) => statement.all(...toSQLValues(parameters)),
        run: (parameters) => {
          const result = statement.run(...toSQLValues(parameters));

          return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
        },
        iterate: (parameters) => statement.iterate(...toSQLValues(parameters)),
      };
    },
  };
}

type SQLValue = string | number | bigint | boolean | null | Uint8Array;

function toSQLValues(parameters: readonly unknown[]): SQLValue[] {
  return parameters.map((value) => toSQLValue(value));
}

function toSQLValue(value: unknown): SQLValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean' ||
    value instanceof Uint8Array
  ) {
    return value;
  }

  return value === undefined ? null : JSON.stringify(value);
}

const STORE_MIGRATIONS: Record<string, Migration> = {
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

  // a finding ID is unique within one repo only, so each disposition keys on the repo too; a row the
  // store held before takes the repo of the reviews that reported its finding when they name one repo,
  // and no repo otherwise, so it applies to no finding until noslop check reads its source again
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

  // each call reads the whole change, so a call record has no chunk
  '0003-calls-without-chunks': {
    up: async (db) => {
      await db.schema.alterTable('calls').dropColumn('chunk').execute();
    },
  },

  // a call counts the input it read from the provider's cache apart from its new input; a row the
  // store held before has no cache counts, and its input count holds the cached share
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

  // a review runs at the depth routing picks, with no step-up, so a review row has no depth it
  // stepped up from
  '0005-reviews-without-step-up': {
    up: async (db) => {
      await db.schema.alterTable('reviews').dropColumn('stepped_up_from').execute();
    },
  },
};
