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

test('it leaves the criteria placeholder in the shared header', () => {
  expect(getLensPrompt('shared-header')).toInclude('{{criteria}}');
});
