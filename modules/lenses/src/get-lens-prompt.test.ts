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

test('it leaves the criteria placeholder in the shared header', () => {
  expect(getLensPrompt('shared-header')).toInclude('{{criteria}}');
});
