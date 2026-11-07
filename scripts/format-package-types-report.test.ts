import { expect, test } from 'bun:test';
import { formatPackageTypesReport } from './format-package-types-report';

test('it reports a pass when tsc exits 0', () => {
  const report = formatPackageTypesReport({ step: 'tsc', exitCode: 0, stdout: '', stderr: '' });

  expect(report).toBe("package types: a project that imports the tarball's subpaths type-checks\n");
});

test("it reports tsc's exit code and output when tsc fails", () => {
  const report = formatPackageTypesReport({
    step: 'tsc',
    exitCode: 2,
    stdout: "index.ts(3,23): error TS2307: Cannot find module '@noslop/cli/check'.\n",
    stderr: '',
  });

  expect(report).toBe(
    "package types: tsc exited 2\nindex.ts(3,23): error TS2307: Cannot find module '@noslop/cli/check'.\n",
  );
});

test('it names the install and gives its output when the install fails', () => {
  const report = formatPackageTypesReport({
    step: 'install',
    exitCode: 1,
    stdout: '',
    stderr: 'error: GET https://registry.npmjs.org/zod - 503\n',
  });

  expect(report).toBe(
    'package types: install exited 1\nerror: GET https://registry.npmjs.org/zod - 503\n',
  );
});
