import type { LensID } from '@noslop/contract';

const PLACEHOLDER = '{{otherLenses}}';

const CONCERNS: readonly { lens: LensID; concern: string }[] = [
  { lens: 'security', concern: 'security' },
  { lens: 'concurrency-and-data-integrity', concern: 'concurrency' },
  { lens: 'failure-handling-and-observability', concern: 'failure handling' },
  { lens: 'deploy-and-config', concern: 'deploy and config' },
];

// Names the concerns of the lenses the whole review runs, so a lens never defers to one that does
// not run. With none to name, the list item that holds the placeholder is dropped and the items
// after it are renumbered.
export function fillOtherLenses(prompt: string, reviewLenses: readonly LensID[]): string {
  if (!prompt.includes(PLACEHOLDER)) {
    return prompt;
  }

  const concerns = CONCERNS.filter((entry) => reviewLenses.includes(entry.lens)).map(
    (entry) => entry.concern,
  );

  if (concerns.length > 0) {
    return prompt.replaceAll(PLACEHOLDER, concerns.join(', '));
  }

  const lines = prompt.split('\n');
  const kept: string[] = [];
  let skipped = false;

  for (const line of lines) {
    if (line.includes(PLACEHOLDER)) {
      skipped = true;
    } else if (skipped && line.trim() === '') {
      skipped = false;

      kept.push(line);
    } else if (skipped) {
      kept.push(
        line.replace(/^(?<number>\d+)\. /u, (_match, number: string) => `${Number(number) - 1}. `),
      );
    } else {
      kept.push(line);
    }
  }

  return kept.join('\n');
}
