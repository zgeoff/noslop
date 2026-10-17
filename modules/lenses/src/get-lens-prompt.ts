import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LensID } from '@noslop/contract';

const PROMPTS_DIR = join(import.meta.dir, 'prompts');

const pages = new Map<string, string>();

// a prompt page holds a header that noslop reads and the model never sees, then the prompt under its
// `## Prompt` heading; the model gets the prompt alone, and each page is read once per process
export function getLensPrompt(id: LensID | 'shared-header'): string {
  const page = pages.get(id) ?? readFileSync(join(PROMPTS_DIR, `${id}.md`), 'utf8');
  const start = page.indexOf('\n## Prompt\n');

  pages.set(id, page);

  if (start === -1) {
    throw new Error(`the prompt page for ${id} has no Prompt section`);
  }

  return page.slice(start + '\n## Prompt\n'.length).trim();
}
