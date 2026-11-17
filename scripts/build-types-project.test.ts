import { expect, test } from 'bun:test';
import { buildTypesProject } from './build-types-project';

test('it makes the project depend on the CLI through the tarball path', () => {
  const project = buildTypesProject('/work/check-a1/noslop-cli.tgz');

  expect(JSON.parse(project['package.json'])).toStrictEqual({
    name: 'project',
    private: true,
    type: 'module',
    dependencies: { '@noslop/cli': 'file:/work/check-a1/noslop-cli.tgz' },
  });
});

test('it makes the project depend on the newer zod through its tarball path when given one', () => {
  const project = buildTypesProject(
    '/work/check-e5/noslop-cli.tgz',
    '/work/check-e5/newer-zod.tgz',
  );

  expect(JSON.parse(project['package.json'])).toStrictEqual({
    name: 'project',
    private: true,
    type: 'module',
    dependencies: {
      '@noslop/cli': 'file:/work/check-e5/noslop-cli.tgz',
      zod: 'file:/work/check-e5/newer-zod.tgz',
    },
  });
});

test("it assigns the package's schema to the project's own zod type when given a zod", () => {
  const project = buildTypesProject(
    '/work/check-f6/noslop-cli.tgz',
    '/work/check-f6/newer-zod.tgz',
  );

  expect(project['index.ts']).toInclude(
    "import type { z } from 'zod';\n\nexport const projectSchema: z.ZodType = reviewResultSchema;\n",
  );
});

test('it leaves zod out of the project when given none', () => {
  const project = buildTypesProject('/work/check-g7/noslop-cli.tgz');

  expect(project['index.ts']).not.toInclude("from 'zod'");
});

test("it type-checks the package's declarations strictly, with the library check on", () => {
  const project = buildTypesProject('/work/check-b2/noslop-cli.tgz');

  expect(JSON.parse(project['tsconfig.json'])).toStrictEqual({
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
  });
});

test('it imports each library subpath that the package exports', () => {
  const project = buildTypesProject('/work/check-c3/noslop-cli.tgz');

  const specifiers = [...project['index.ts'].matchAll(/from '(?<specifier>[^']+)'/gu)].map(
    (match) => match.groups?.['specifier'],
  );

  expect(new Set(specifiers)).toStrictEqual(
    new Set([
      '@noslop/cli/contract',
      '@noslop/cli/check',
      '@noslop/cli/post',
      '@noslop/cli/verify',
    ]),
  );
});

test('it expects one type error, so declarations that resolve to any fail the check', () => {
  const project = buildTypesProject('/work/check-d4/noslop-cli.tgz');

  expect(project['index.ts']).toInclude(
    '// @ts-expect-error a finding count is no string\nexport const wrong: string = countFindings({});\n',
  );
});
