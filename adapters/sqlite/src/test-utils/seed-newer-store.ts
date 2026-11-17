import { Database } from 'bun:sqlite';
import { loadStore } from '../store/load-store';

export interface MigrationRow {
  name: string;
  timestamp: string;
}

export async function seedNewerStore(path: string, migration: MigrationRow): Promise<void> {
  const store = await loadStore(path);

  await store.destroy();

  const database = new Database(path, { strict: true });

  // A store that a later noslop migrated past the newest migration this version knows.
  database.run('INSERT INTO kysely_migration (name, timestamp) VALUES (?, ?)', [
    migration.name,
    migration.timestamp,
  ]);

  database.close();
}
