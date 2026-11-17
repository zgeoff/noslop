import { Database } from 'bun:sqlite';
import { loadStore } from '../store/load-store';

export async function seedNewerStore(path: string): Promise<void> {
  const store = await loadStore(path);

  await store.destroy();

  const database = new Database(path, { strict: true });

  // A store that a later noslop migrated past the newest migration this version knows.
  database.run(
    `INSERT INTO kysely_migration (name, timestamp) VALUES ('9999-a-later-schema', '2026-10-18T09:00:00.000Z')`,
  );

  database.close();
}
