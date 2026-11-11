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

test('it tells the naming lens to report a one-off script under a rule and skip a script the repo runs again', () => {
  const prompt = getLensPrompt('naming-shape-and-comments');

  expect(prompt).toIncludeMultiple([
    'Look for a script that ran once to change the tree',
    'codemod, a rename script or a one-off rewrite of text, when the rules file states a rule against',
    '5. A script the repo runs again, such as a build, check or release script, or a helper that one of',
    'P2 for a one-off script, under the criterion',
  ]);
});

test('it labels the naming lens items with the rules file section names', () => {
  const prompt = getLensPrompt('naming-shape-and-comments');

  expect(prompt).toIncludeMultiple([
    '1. Function names: a verb whose guarantee in the verb table the function breaks',
    '2. Comments.',
    '3. Types. The `typeClaims` slice',
    '4. One-off codemods. The `scripts` slice',
  ]);
});

test('it tells the naming lens to quote a comment rule from the code-style Comments section', () => {
  const prompt = getLensPrompt('naming-shape-and-comments');

  expect(prompt).toIncludeMultiple([
    'When the rules file holds the `code-style` skill, quote the rule from the',
    '`Comments` section of that skill.',
  ]);
});

test('it tells the naming lens to quote a verb table row and skip a choice between two verbs', () => {
  const prompt = getLensPrompt('naming-shape-and-comments');

  expect(prompt).toIncludeMultiple([
    '2. For a function name, quote the one row of the verb table whose guarantee the name breaks.',
    '4. A choice between two verbs, such as `read` or `load`. A function name finding reports a broken',
  ]);
});

test('it tells the tests lens to report a direct write outside a seed with a quote of the seeding rule', () => {
  const prompt = getLensPrompt('tests');

  expect(prompt).toIncludeMultiple([
    '3. Seeding stored state: a test that writes database rows or files on disk directly, such as with a',
    "   query builder's insert call or an SQL `INSERT` statement, in a place the seeding rule does not",
    '4. For a direct write, quote the seeding rule, name the write, and name what the rule says the test',
    '4. A direct write in a place the seeding rule allows.',
  ]);
});

test.each([
  ['naming-shape-and-comments'],
  ['architecture-and-boundaries'],
  ['failure-handling-and-observability'],
  ['tests'],
] as const)(
  'it tells the %s lens to report a rule only with a quote from the rules file',
  (lens) => {
    expect(getLensPrompt(lens)).toInclude(
      'the rule from the rules file. A candidate with no rule to quote is not a',
    );
  },
);

test('it leaves the criteria placeholder in the shared header', () => {
  expect(getLensPrompt('shared-header')).toInclude('{{criteria}}');
});
