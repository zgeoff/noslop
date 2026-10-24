import type { CallLens } from '@noslop/contract';
import architectureAndBoundaries from './prompts/architecture-and-boundaries.md' with { type: 'text' };
import concurrencyAndDataIntegrity from './prompts/concurrency-and-data-integrity.md' with { type: 'text' };
import correctness from './prompts/correctness.md' with { type: 'text' };
import crossRepoAndPlatformLimits from './prompts/cross-repo-and-platform-limits.md' with { type: 'text' };
import deployAndConfig from './prompts/deploy-and-config.md' with { type: 'text' };
import design from './prompts/design.md' with { type: 'text' };
import documentation from './prompts/documentation.md' with { type: 'text' };
import failureHandlingAndObservability from './prompts/failure-handling-and-observability.md' with { type: 'text' };
import instructions from './prompts/instructions.md' with { type: 'text' };
import intent from './prompts/intent.md' with { type: 'text' };
import namingShapeAndComments from './prompts/naming-shape-and-comments.md' with { type: 'text' };
import reuse from './prompts/reuse.md' with { type: 'text' };
import security from './prompts/security.md' with { type: 'text' };
import sharedHeader from './prompts/shared-header.md' with { type: 'text' };
import tests from './prompts/tests.md' with { type: 'text' };

// The bundled CLI ships without the prompt files, so the pages are imported as text for the bundler
// to inline.
const PAGES: Record<CallLens | 'shared-header', string> = {
  'architecture-and-boundaries': architectureAndBoundaries,
  'concurrency-and-data-integrity': concurrencyAndDataIntegrity,
  correctness,
  'cross-repo-and-platform-limits': crossRepoAndPlatformLimits,
  'deploy-and-config': deployAndConfig,
  design,
  documentation,
  'failure-handling-and-observability': failureHandlingAndObservability,
  instructions,
  intent,
  'naming-shape-and-comments': namingShapeAndComments,
  reuse,
  security,
  'shared-header': sharedHeader,
  tests,
};

export function getLensPrompt(id: CallLens | 'shared-header'): string {
  const page = PAGES[id];
  const start = page.indexOf('\n## Prompt\n');

  if (start === -1) {
    throw new Error(`the prompt page for ${id} has no Prompt section`);
  }

  return page.slice(start + '\n## Prompt\n'.length).trim();
}
