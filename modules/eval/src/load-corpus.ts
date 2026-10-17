import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Case } from './case';
import { caseSchema } from './case';

// a corpus is a folder with one folder per case, each holding its labels in case.json; cases load in
// name order so 2 runs replay them in the same order
export async function loadCorpus(corpusDir: string): Promise<Case[]> {
  const entries = await readdir(corpusDir, { withFileTypes: true });

  const names = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();

  const cases: Case[] = [];

  for (const name of names) {
    const file = Bun.file(join(corpusDir, name, 'case.json'));

    if (!(await file.exists())) {
      continue;
    }

    const raw: unknown = await file.json();

    const parsed = caseSchema.safeParse(raw);

    if (!parsed.success) {
      throw new Error(`case ${name} is not a valid case: ${parsed.error.message}`);
    }

    cases.push(parsed.data);
  }

  return cases;
}
