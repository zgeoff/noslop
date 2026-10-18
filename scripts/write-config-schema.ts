// Writes the JSON Schema of review.json to docs/reference/review.schema.json. A test in
// @noslop/contract fails when the committed file differs from what this script writes.
import { join } from 'node:path';
import { buildConfigFileJSONSchema } from '@noslop/contract';

const path = join(import.meta.dir, '..', 'docs', 'reference', 'review.schema.json');

await Bun.write(path, `${JSON.stringify(buildConfigFileJSONSchema(), null, 2)}\n`);

process.stdout.write('wrote docs/reference/review.schema.json\n');
