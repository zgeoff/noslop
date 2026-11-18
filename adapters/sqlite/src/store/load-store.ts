import { Database } from 'bun:sqlite';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { SqliteDatabase, SqliteStatement } from 'kysely';
import { Kysely, SqliteDialect } from 'kysely';
import { Migrator } from 'kysely/migration';
import { z } from 'zod';
import { STORE_MIGRATIONS } from './store-migrations';
import type { StoreTables } from './store-tables';

export type Store = Kysely<StoreTables>;

export interface LoadStoreOptions {
  version?: string;
}

export async function loadStore(path: string, options: LoadStoreOptions = {}): Promise<Store> {
  await mkdir(dirname(path), { recursive: true });

  const database = new Database(path, { create: true, strict: true });

  try {
    requireKnownSchema(database, options.version);
  } catch (error) {
    database.close();
    throw error;
  }

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

const NEWEST_MIGRATION = Object.keys(STORE_MIGRATIONS).toSorted().at(-1) ?? '';
const NamedRowSchema = z.object({ name: z.string() });

function requireKnownSchema(database: Database, version: string | undefined): void {
  const table = NamedRowSchema.nullable().parse(
    database
      .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'kysely_migration'")
      .get(),
  );

  if (table === null) {
    return;
  }

  const newest = NamedRowSchema.nullable().parse(
    database.query('SELECT name FROM kysely_migration ORDER BY name DESC LIMIT 1').get(),
  );

  if (newest === null || newest.name <= NEWEST_MIGRATION) {
    return;
  }

  const noslop = version === undefined ? 'this noslop' : `this noslop (${version})`;

  throw new Error(
    `the store schema ${newest.name} is newer than ${noslop}, whose newest migration is ${NEWEST_MIGRATION}; update the pin`,
  );
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
