import { expect, test } from 'bun:test';
import { LENS_IDS } from '@noslop/contract';
import { getLensPrompt } from './get-lens-prompt';

test('it gives every lens a prompt without the header the model never sees', () => {
  const prompts = LENS_IDS.map((lens) => getLensPrompt(lens));

  expect(prompts).toSatisfyAll(
    (prompt: string) =>
      prompt.length > 0 && !prompt.includes('- Trigger:') && !prompt.startsWith('#'),
  );
});

test('it tells the naming lens to skip as const, satisfies and a disable comment the change did not add', () => {
  const prompt = getLensPrompt('naming-shape-and-comments');

  expect(prompt).toIncludeMultiple([
    '2. Code the change did not add or change, such as a disable comment that was there before it.',
    '3. An `as const` assertion, or a `satisfies` expression: neither one turns a type check off.',
  ]);
});

test('it tells the naming lens to cite a role table row and skip a choice between two verbs', () => {
  const prompt = getLensPrompt('naming-shape-and-comments');

  expect(prompt).toIncludeMultiple([
    '2. For rule 1, cite the one row of the role table whose promise the name breaks. A rules file with',
    '   - A test data factory named `create`, where the table gives data factories another verb.',
    '4. A choice between two verbs, such as `read` or `load`. Rule 1 reports a broken promise, never a',
  ]);
});

test('it leaves the criteria placeholder in the shared header', () => {
  expect(getLensPrompt('shared-header')).toInclude('{{criteria}}');
});
