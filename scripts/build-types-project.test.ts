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
