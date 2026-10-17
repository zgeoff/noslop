import { basename } from 'node:path';
import type { ModelFinding } from '@noslop/contract';
import type { AnalyzedFile } from './analyzed-file';
import { buildStaticFinding } from './build-static-finding';
import type { SecurityEntry } from './types';

const TEST_PATH_IN_TEXT = /[\w./-]+\.(?:test|spec)\.[cm]?[jt]sx?/gu;

// the direct findings about tests: a new test with no assertion, 2 tests with one body, a type test
// on a key its type lacks, a new allow-or-deny check whose tests hold no table of hostile inputs, and
// a test file that the pull request body names and the change does not add
export function collectTestFindings(
  files: readonly AnalyzedFile[],
  security: readonly SecurityEntry[],
  body: string,
): ModelFinding[] {
  return [
    ...collectUnassertedTests(files),
    ...collectDuplicateTests(files),
    ...collectMissingTypeKeys(files),
    ...collectUntabledChecks(files, security),
    ...collectNamedMissingTests(files, body),
  ];
}

function collectUnassertedTests(files: readonly AnalyzedFile[]): ModelFinding[] {
  return files.flatMap((entry) =>
    (entry.analysis?.tests ?? [])
      .filter(
        (test) => !entry.isContext && entry.lines.added.has(test.startLine) && !test.hasAssertion,
      )
      .map((test) =>
        buildStaticFinding({
          title: `Test "${formatShort(test.title)}" asserts nothing`,
          body: 'The test body holds no assertion, so it passes whatever the code under test does.',
          anchor: { path: entry.file.path, startLine: test.startLine, endLine: test.startLine },
          criterion: 'untested-change',
          fix: 'Assert the result the test name promises.',
        }),
      ),
  );
}

function collectDuplicateTests(files: readonly AnalyzedFile[]): ModelFinding[] {
  const seen = new Map<string, { path: string; line: number; title: string }>();

  const findings: ModelFinding[] = [];

  const ordered = files
    .flatMap((entry) =>
      (entry.analysis?.tests ?? []).map((test) => ({
        entry,
        test,
        isNew: entry.lines.added.has(test.startLine),
      })),
    )
    .toSorted((left, right) => Number(left.isNew) - Number(right.isNew));

  for (const item of ordered) {
    const first = seen.get(item.test.fingerprint);

    if (first === undefined) {
      seen.set(item.test.fingerprint, {
        path: item.entry.file.path,
        line: item.test.startLine,
        title: item.test.title,
      });

      continue;
    }

    if (item.isNew && !item.entry.isContext) {
      findings.push(
        buildStaticFinding({
          title: `Test "${formatShort(item.test.title)}" repeats another test's body`,
          body: `The body is the same as the body of "${first.title}" at ${first.path}:${first.line}, so one of the 2 tests checks nothing the other does not.`,
          anchor: {
            path: item.entry.file.path,
            startLine: item.test.startLine,
            endLine: item.test.startLine,
          },
          criterion: 'duplicate-helper',
          fix: 'Remove the copy, or change it to test the case its name describes.',
        }),
      );
    }
  }

  return findings;
}

function collectMissingTypeKeys(files: readonly AnalyzedFile[]): ModelFinding[] {
  const types = new Map(
    files.flatMap((entry) =>
      (entry.analysis?.types ?? []).map((declared) => [declared.name, declared]),
    ),
  );

  return files.flatMap((entry) =>
    (entry.analysis?.typeTests ?? []).flatMap((typeTest) => {
      const declared = types.get(typeTest.typeName);

      if (entry.isContext || !entry.lines.added.has(typeTest.line) || declared === undefined) {
        return [];
      }

      if (declared.keys.includes(typeTest.key)) {
        return [];
      }

      return [
        buildStaticFinding({
          title: `Type test checks key "${typeTest.key}" that ${typeTest.typeName} lacks`,
          body: `${typeTest.typeName} declares ${declared.keys.join(', ') || 'no keys'}, so the type test cannot pass as written.`,
          anchor: { path: entry.file.path, startLine: typeTest.line, endLine: typeTest.line },
          criterion: 'untested-change',
        }),
      ];
    }),
  );
}

function collectUntabledChecks(
  files: readonly AnalyzedFile[],
  security: readonly SecurityEntry[],
): ModelFinding[] {
  const checks = security.filter((item) => item.part === 'allow-deny-check');

  return checks.flatMap((check) => {
    const stem = basename(check.location.path).replace(/\.[cm]?[jt]sx?$/u, '');

    const tests = files.filter(
      (entry) =>
        (entry.file.kind === 'test' && basename(entry.file.path).startsWith(`${stem}.`)) ||
        entry.analysis?.imports.some((item) => item.source.endsWith(`/${stem}`)) === true,
    );

    const hasTable = tests.some((entry) =>
      (entry.analysis?.tests ?? []).some((test) => test.isTable),
    );

    if (hasTable) {
      return [];
    }

    return [
      buildStaticFinding({
        title: 'New allow-or-deny check has no table of hostile inputs',
        body: `${check.detail}, and no test of this file runs a test.each table over the inputs the check must refuse.`,
        anchor: check.location,
        criterion: 'untested-change',
        missingChange: true,
        fix: 'Add a test.each table of refused inputs beside the allowed case.',
      }),
    ];
  });
}

function collectNamedMissingTests(files: readonly AnalyzedFile[], body: string): ModelFinding[] {
  const changed = new Set(
    files
      .filter((entry) => !entry.isContext && entry.file.status !== 'deleted')
      .map((entry) => entry.file.path),
  );

  const named = [...new Set(body.match(TEST_PATH_IN_TEXT))];
  const anchorFile = files.find((entry) => !entry.isContext);

  if (anchorFile === undefined) {
    return [];
  }

  return named
    .filter((name) => ![...changed].some((path) => path === name || path.endsWith(`/${name}`)))
    .map((name) =>
      buildStaticFinding({
        title: `The pull request names ${formatShort(name)}, which the change does not add`,
        body: `The pull request body names the test file ${name}, and the change neither adds nor edits it.`,
        anchor: { path: anchorFile.file.path, startLine: 1, endLine: 1 },
        criterion: 'intent-mismatch',
        missingChange: true,
      }),
    );
}

function formatShort(text: string): string {
  return text.length > 40 ? `${text.slice(0, 37)}...` : text;
}
