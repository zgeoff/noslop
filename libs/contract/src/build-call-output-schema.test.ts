import { expect, test } from 'bun:test';
import type { CallOutput } from './build-call-output-schema';
import { buildCallOutputJSONSchema, buildCallOutputSchema } from './build-call-output-schema';

test('it accepts one findings list per fired lens', () => {
  const payload: CallOutput = {
    findings: {
      correctness: [
        {
          title: 'Keep the items in the queue until the batch write succeeds',
          body: 'The loop deletes every item, then writes the batch.',
          anchor: { path: 'src/queue.ts', startLine: 12, endLine: 14 },
          secondLocation: null,
          severity: 'P2',
          criterion: 'wrong-behaviour-edge-path',
          rule: null,
          verdict: 'CONFIRMED',
          unverifiedFact: null,
          missingChange: false,
          fix: null,
        },
      ],
      security: [],
    },
  };

  expect(buildCallOutputSchema(['correctness', 'security']).safeParse(payload).data).toStrictEqual(
    payload,
  );
});

test('it rejects a findings list for a lens that did not fire', () => {
  const result = buildCallOutputSchema(['correctness']).safeParse({
    findings: { correctness: [], security: [] },
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['findings'] });
});

test('it rejects output that leaves out a fired lens', () => {
  const result = buildCallOutputSchema(['correctness', 'security']).safeParse({
    findings: { correctness: [] },
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['findings', 'security'] });
});

test('it rejects a finding that leaves out a nullable key', () => {
  const result = buildCallOutputSchema(['correctness']).safeParse({
    findings: {
      correctness: [
        {
          title: 'Keep the items in the queue until the batch write succeeds',
          body: 'The loop deletes every item, then writes the batch.',
          anchor: { path: 'src/queue.ts', startLine: 12, endLine: 14 },
          secondLocation: null,
          severity: 'P2',
          criterion: 'wrong-behaviour-edge-path',
          rule: null,
          verdict: 'CONFIRMED',
          missingChange: false,
          fix: null,
        },
      ],
    },
  });

  expect(result.error?.issues).toPartiallyContain({
    path: ['findings', 'correctness', 0, 'unverifiedFact'],
  });
});

test('it exports a JSON Schema that requires every key and allows no other', () => {
  expect(buildCallOutputJSONSchema(['correctness'])).toMatchInlineSnapshot(`
    {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false,
      "properties": {
        "findings": {
          "additionalProperties": false,
          "properties": {
            "correctness": {
              "items": {
                "additionalProperties": false,
                "properties": {
                  "anchor": {
                    "additionalProperties": false,
                    "properties": {
                      "endLine": {
                        "maximum": 9007199254740991,
                        "minimum": -9007199254740991,
                        "type": "integer",
                      },
                      "path": {
                        "type": "string",
                      },
                      "startLine": {
                        "maximum": 9007199254740991,
                        "minimum": -9007199254740991,
                        "type": "integer",
                      },
                    },
                    "required": [
                      "path",
                      "startLine",
                      "endLine",
                    ],
                    "type": "object",
                  },
                  "body": {
                    "type": "string",
                  },
                  "criterion": {
                    "enum": [
                      "security-defect",
                      "data-loss",
                      "outage",
                      "wrong-result-main-path",
                      "wrong-behaviour-edge-path",
                      "untested-change",
                      "taste-rule",
                      "misleading-name",
                      "intent-mismatch",
                      "duplicate-helper",
                      "instruction-conflict",
                      "wrong-doc-fact",
                      "naming",
                      "comments",
                      "documentation-prose",
                      "noisy-log",
                    ],
                    "type": "string",
                  },
                  "fix": {
                    "type": [
                      "string",
                      "null",
                    ],
                  },
                  "missingChange": {
                    "type": "boolean",
                  },
                  "rule": {
                    "type": [
                      "string",
                      "null",
                    ],
                  },
                  "secondLocation": {
                    "anyOf": [
                      {
                        "additionalProperties": false,
                        "properties": {
                          "commit": {
                            "type": "string",
                          },
                          "endLine": {
                            "maximum": 9007199254740991,
                            "minimum": -9007199254740991,
                            "type": "integer",
                          },
                          "path": {
                            "type": "string",
                          },
                          "repo": {
                            "type": "string",
                          },
                          "startLine": {
                            "maximum": 9007199254740991,
                            "minimum": -9007199254740991,
                            "type": "integer",
                          },
                        },
                        "required": [
                          "repo",
                          "commit",
                          "path",
                          "startLine",
                          "endLine",
                        ],
                        "type": "object",
                      },
                      {
                        "type": "null",
                      },
                    ],
                  },
                  "severity": {
                    "enum": [
                      "P1",
                      "P2",
                      "P3",
                    ],
                    "type": "string",
                  },
                  "title": {
                    "type": "string",
                  },
                  "unverifiedFact": {
                    "type": [
                      "string",
                      "null",
                    ],
                  },
                  "verdict": {
                    "enum": [
                      "CONFIRMED",
                      "PLAUSIBLE",
                    ],
                    "type": "string",
                  },
                },
                "required": [
                  "title",
                  "body",
                  "anchor",
                  "secondLocation",
                  "severity",
                  "criterion",
                  "rule",
                  "verdict",
                  "unverifiedFact",
                  "missingChange",
                  "fix",
                ],
                "type": "object",
              },
              "type": "array",
            },
          },
          "required": [
            "correctness",
          ],
          "type": "object",
        },
      },
      "required": [
        "findings",
      ],
      "type": "object",
    }
  `);
});
