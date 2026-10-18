import { expect, test } from 'bun:test';
import { rulesFileSchema } from './review-config';

test('it accepts a rules file entry with a path, a label and references', () => {
  const payload = {
    path: 'RULES.md',
    label: 'house rules',
    references: { 'sql.md': ['**/*.sql'] },
  };

  expect(rulesFileSchema.safeParse(payload).data).toStrictEqual(payload);
});

test('it rejects a rules file entry that lists skip', () => {
  const result = rulesFileSchema.safeParse({
    path: 'RULES.md',
    label: 'house rules',
    references: { 'sql.md': ['**/*.sql'] },
    skip: ['Loading the skill'],
  });

  expect(result.error?.issues).toPartiallyContain({ code: 'unrecognized_keys', keys: ['skip'] });
});
