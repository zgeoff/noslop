import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { buildConfigFileJSONSchema } from './build-config-file-json-schema';

test('it matches the JSON Schema committed under docs/reference', async () => {
  const committed: unknown = await Bun.file(
    join(import.meta.dir, '..', '..', '..', 'docs', 'reference', 'review.schema.json'),
  ).json();

  expect(committed).toStrictEqual(buildConfigFileJSONSchema());
});

test('it requires no key of a file and lets each one take null', () => {
  const schema = buildConfigFileJSONSchema();

  expect(schema).not.toContainKey('required');

  expect(schema).toMatchObject({
    properties: {
      report: { anyOf: [{ type: 'array' }, { type: 'null' }] },
      thresholds: {
        anyOf: [
          { properties: { lightMaxLines: { anyOf: [{ type: 'integer' }, { type: 'null' }] } } },
          { type: 'null' },
        ],
      },
    },
  });
});

test('it takes rules as one path, a list of paths and entries, or null', () => {
  const schema = buildConfigFileJSONSchema();

  expect(schema).toMatchObject({
    properties: {
      rules: {
        anyOf: [
          { type: 'string' },
          { type: 'array', items: { anyOf: [{ type: 'string' }, { required: ['path'] }] } },
          { type: 'null' },
        ],
      },
      extends: { type: 'string' },
    },
  });
});
