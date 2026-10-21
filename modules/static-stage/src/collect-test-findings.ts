import { basename } from 'node:path';
import type { ModelFinding } from '@noslop/contract';
import type { AnalyzedFile } from './analyzed-file';
import { buildStaticFinding } from './build-static-finding';
import type { SecurityEntry } from './types';

export interface NamedTestClaims {
  body: string;
  pullRequestAndMergePaths: readonly string[];
  headPaths: readonly string[];
}

// the direct findings about tests: a new test with no assertion, 2 tests with one body, a type test
// on a key its type lacks, an allow-or-deny check whose body changed and whose tests hold no table of
// hostile inputs, and a test file the pull request body claims that the whole pull request does not add
export function collectTestFindings(
  files: readonly AnalyzedFile[],
  security: readonly SecurityEntry[],
  baseChecks: ReadonlyMap<string, readonly string[]>,
  claims: NamedTestClaims,
): ModelFinding[] {
  return [
    ...collectUnassertedTests(files),
    ...collectDuplicateTests(files),
    ...collectMissingTypeKeys(files),
    ...collectUntabledChecks(files, security, baseChecks),
    ...collectNamedMissingTests(files, claims),
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

function formatShort(text: string): string {
  return text.length > 40 ? `${text.slice(0, 37)}...` : text;
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

      // a type that takes keys from elsewhere has keys the walk cannot list
      if (!declared.isComplete || declared.keys.includes(typeTest.key)) {
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
  baseChecks: ReadonlyMap<string, readonly string[]>,
): ModelFinding[] {
  const checks = security.filter(
    (item, index) =>
      item.part === 'allow-deny-check' &&
      hasChangedBody(
        item,
        security.slice(0, index).filter((earlier) => isSameCheckPlace(earlier, item)).length,
        files,
        baseChecks,
      ),
  );

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

// the slice keeps the walk's order, so the ordinal among the checks with one place and detail picks
// the check's own fact, and a copy of a base check's body counts as new once it outnumbers the base
function hasChangedBody(
  check: SecurityEntry,
  ordinal: number,
  files: readonly AnalyzedFile[],
  baseChecks: ReadonlyMap<string, readonly string[]>,
): boolean {
  const entry = files.find((item) => !item.isContext && item.file.path === check.location.path);

  const headChecks = (entry?.analysis?.security ?? []).filter(
    (item) => item.part === 'allow-deny-check',
  );

  const fact = headChecks.filter(
    (item) =>
      item.line === check.location.startLine &&
      item.endLine === check.location.endLine &&
      item.detail === check.detail,
  )[ordinal];

  const baseBodies = baseChecks.get(check.location.path);

  if (fact?.body === undefined || baseBodies === undefined) {
    return true;
  }

  const headCount = headChecks.filter((item) => item.body === fact.body).length;
  const baseCount = baseBodies.filter((body) => body === fact.body).length;

  return headCount > baseCount;
}

function isSameCheckPlace(left: SecurityEntry, right: SecurityEntry): boolean {
  return (
    left.part === right.part &&
    left.detail === right.detail &&
    left.location.path === right.location.path &&
    left.location.startLine === right.location.startLine &&
    left.location.endLine === right.location.endLine
  );
}

// a name starts where its path starts and holds the glob characters of a pattern, so a pattern such as
// src/*/index.test.ts never yields the partial name /index.test.ts
const TEST_PATH_IN_TEXT = /(?<![\w./*?{}\]-])[\w./*?{}-]+\.(?:test|spec)\.[cm]?[jt]sx?(?![\w-])/gu;
const GLOB_CHARACTERS = /[*?{}]/u;

const CLAIMED_EDIT =
  /\b(?:add|adds|added|adding|create|creates|created|write|writes|wrote|written|extend|extends|extended|edit|edits|update|updates|change|changes|rewrite|rewrites|rewrote|rewritten|(?<!\b(?:the|an?)\s)(?:edited|updated|changed))\b/iu;

const NON_PROSE = /`[^`]*`|"[^"]*"/gu;

// Markdown wraps a sentence over several lines, so a line ends a sentence only before a blank line, a
// list item, a heading, a quote, a table row or a code fence
const SENTENCE_BREAK = /(?<=[.!?])\s+|\n(?=[ \t]*(?:\n|$|[-*+>#|]|\d+[.)]|```))/mu;

function collectNamedMissingTests(
  files: readonly AnalyzedFile[],
  claims: NamedTestClaims,
): ModelFinding[] {
  const changed = new Set([
    ...files.flatMap((entry) =>
      entry.isContext ? [] : [entry.file.path, entry.file.oldPath ?? entry.file.path],
    ),
    ...claims.pullRequestAndMergePaths,
  ]);

  const named = [
    ...new Set(
      (claims.body.match(TEST_PATH_IN_TEXT) ?? [])
        .filter((name) => !GLOB_CHARACTERS.test(name))
        .map((name) => name.replace(/^(?:\.\.?\/)+/u, '')),
    ),
  ];

  const anchorFile = files.find((entry) => !entry.isContext);

  if (anchorFile === undefined) {
    return [];
  }

  const sentences = claims.body.split(SENTENCE_BREAK);

  return named
    .filter((name) => !isPathListed(name, changed))
    .filter(
      (name) =>
        !isPathListed(name, claims.headPaths) ||
        sentences.some(
          (sentence) =>
            sentence.includes(name) &&
            CLAIMED_EDIT.test(sentence.replace(NON_PROSE, '').replace(TEST_PATH_IN_TEXT, '')),
        ),
    )
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

function isPathListed(name: string, paths: Iterable<string>): boolean {
  return [...paths].some((path) => path === name || path.endsWith(`/${name}`));
}
