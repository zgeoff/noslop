export type TypesProject = Record<'package.json' | 'tsconfig.json' | 'index.ts', string>;

export function buildTypesProject(tarballPath: string): TypesProject {
  return {
    'package.json': JSON.stringify({
      name: 'project',
      private: true,
      type: 'module',
      dependencies: { '@noslop/cli': `file:${tarballPath}` },
    }),
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        strict: true,
        module: 'nodenext',
        moduleResolution: 'nodenext',
        target: 'esnext',
        noEmit: true,
        skipLibCheck: false,
        types: [],
      },
      include: ['index.ts'],
    }),
    'index.ts': [
      "import type { ReviewResult } from '@noslop/cli/contract';",
      "import { REVIEW_OUTPUT_VERSION, reviewResultSchema } from '@noslop/cli/contract';",
      "import { check } from '@noslop/cli/check';",
      "import { sendResult } from '@noslop/cli/post';",
      "import { verify } from '@noslop/cli/verify';",
      '',
      'export function verifyHead(value: unknown): Promise<string> {',
      '  return verify(value, { env: {} }).then((result) => result.head);',
      '}',
      '',
      'export function postHead(value: unknown): Promise<string> {',
      '  return sendResult(value, { env: {}, verify: false }).then((result) => result.head);',
      '}',
      '',
      'export function isPassed(): Promise<boolean> {',
      "  return check({ owner: 'o', repo: 'r', number: 1 }, { env: {} }).then((outcome) => outcome.conclusion === 'success');",
      '}',
      '',
      'export function countFindings(value: unknown): number {',
      '  const result: ReviewResult = reviewResultSchema.parse(value);',
      '  const version: typeof REVIEW_OUTPUT_VERSION = result.version;',
      '',
      '  return result.findings.length + version;',
      '}',
      '',
      '// @ts-expect-error a finding count is no string',
      'export const wrong: string = countFindings({});',
      '',
    ].join('\n'),
  };
}
