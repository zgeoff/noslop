import type { LensID } from '@noslop/contract';
import architecture from './prompts/architecture-and-boundaries.md' with { type: 'text' };
import concurrency from './prompts/concurrency-and-data-integrity.md' with { type: 'text' };
import correctness from './prompts/correctness.md' with { type: 'text' };
import crossRepo from './prompts/cross-repo-and-platform-limits.md' with { type: 'text' };
import deploy from './prompts/deploy-and-config.md' with { type: 'text' };
import documentation from './prompts/documentation.md' with { type: 'text' };
import failureHandling from './prompts/failure-handling-and-observability.md' with { type: 'text' };
import instructions from './prompts/instructions.md' with { type: 'text' };
import intent from './prompts/intent.md' with { type: 'text' };
import naming from './prompts/naming-shape-and-comments.md' with { type: 'text' };
import reuse from './prompts/reuse.md' with { type: 'text' };
import security from './prompts/security.md' with { type: 'text' };
import sharedHeader from './prompts/shared-header.md' with { type: 'text' };
import tests from './prompts/tests.md' with { type: 'text' };

const PAGES: Readonly<Record<LensID | 'shared-header', string>> = {
  correctness,
  'failure-handling-and-observability': failureHandling,
  'concurrency-and-data-integrity': concurrency,
  security,
  'architecture-and-boundaries': architecture,
  'naming-shape-and-comments': naming,
  'cross-repo-and-platform-limits': crossRepo,
  'deploy-and-config': deploy,
  intent,
  tests,
  reuse,
  instructions,
  documentation,
  'shared-header': sharedHeader,
};

// a prompt page holds a header that noslop reads and the model never sees, then the prompt under its
// `## Prompt` heading; the model gets the prompt alone
export function getLensPrompt(id: LensID | 'shared-header'): string {
  const page = PAGES[id];
  const start = page.indexOf('\n## Prompt\n');

  if (start === -1) {
    throw new Error(`the prompt page for ${id} has no Prompt section`);
  }

  return page.slice(start + '\n## Prompt\n'.length).trim();
}
