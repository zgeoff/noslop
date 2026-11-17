import { z } from 'zod';
import { reviewConfigSchema, rulesFileSchema } from './review-config';

type JSONSchema = Record<string, unknown>;

export function buildConfigFileJSONSchema(): JSONSchema {
  const merged = z.toJSONSchema(reviewConfigSchema, { io: 'input' });
  const rulesFile = z.toJSONSchema(rulesFileSchema, { io: 'input' });
  const relaxed = buildFileObjectSchema(merged);
  const properties = isJSONSchema(relaxed['properties']) ? relaxed['properties'] : {};
  const rules = isJSONSchema(properties['rules']) ? properties['rules'] : {};
  const { $schema: _draft, ...rulesEntry } = rulesFile;

  return {
    $schema: merged.$schema,
    title: 'review.json',
    description: "A repo's noslop config; every key is optional, and null removes an inherited key",
    ...relaxed,
    properties: {
      $schema: {
        type: 'string',
        description: 'The JSON Schema an editor checks this file against',
      },
      extends: {
        type: 'string',
        minLength: 1,
        description:
          'The parent config: a path relative to this file, or github:<owner>/<repo>[/<path>][@<ref>]',
      },
      ...properties,
      rules: {
        description: rules['description'],
        anyOf: [
          { type: 'string', minLength: 1 },
          {
            type: 'array',
            minItems: 1,
            items: { anyOf: [{ type: 'string', minLength: 1 }, rulesEntry] },
          },
          { type: 'null' },
        ],
      },
    },
  };
}

function buildFileObjectSchema(schema: JSONSchema): JSONSchema {
  const { required: _required, ...rest } = schema;
  const properties = isJSONSchema(rest['properties']) ? rest['properties'] : null;
  const values = isJSONSchema(rest['additionalProperties']) ? rest['additionalProperties'] : null;

  return {
    ...rest,
    ...(properties === null
      ? {}
      : {
          properties: Object.fromEntries(
            Object.entries(properties).map(([key, value]) => [key, buildFileValueSchema(value)]),
          ),
        }),
    ...(values === null ? {} : { additionalProperties: buildFileValueSchema(values) }),
  };
}

function isJSONSchema(value: unknown): value is JSONSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildFileValueSchema(value: unknown): unknown {
  if (!isJSONSchema(value)) {
    return value;
  }

  const schema = value['type'] === 'object' ? buildFileObjectSchema(value) : value;

  if (Array.isArray(schema['anyOf'])) {
    return schema;
  }

  const { description, ...rest } = schema;

  return {
    ...(description === undefined ? {} : { description }),
    anyOf: [rest, { type: 'null' }],
  };
}
