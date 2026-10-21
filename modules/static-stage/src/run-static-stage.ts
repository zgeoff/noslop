import { basename, dirname, join } from 'node:path';
import type { ModelFinding, ReviewConfig } from '@noslop/contract';
import type { Runner } from '@noslop/runner';
import type { AnalyzedFile, PackageManifest } from './analyzed-file';
import { buildChangedLines } from './build-changed-lines';
import { buildEdgeSlice } from './build-edge-slice';
import { buildFileSlices } from './build-file-slices';
import { buildFunctionSlices } from './build-function-slices';
import { buildReuseSlice } from './build-reuse-slice';
import { buildRiskSignals } from './build-risk-signals';
import { buildScriptSlice } from './build-script-slice';
import type { ConsumerManifest } from './collect-change-findings';
import { collectChangeFindings } from './collect-change-findings';
import { collectInstructionFindings } from './collect-instruction-findings';
import { collectSourceFacts } from './collect-source-facts';
import { collectTestFindings } from './collect-test-findings';
import { isGlobMatch } from './is-glob-match';
import { isReleaseChange } from './is-release-change';
import { isWorkflowFile } from './is-workflow-file';
import { loadBaseIndex } from './load-base-index';
import { parsePackageManifest } from './parse-package-manifest';
import { parseSource } from './parse-source';
import { pickFileKind } from './pick-file-kind';
import { readFilesAtCommit } from './read-files-at-commit';
import type { Change, ChangedFile, RiskSignals, Slices } from './types';

export interface RunStaticStageOptions {
  runner: Runner;
  repoDir: string;
  change: Change;
  config: ReviewConfig;
  title: string;
  body: string;
  linkedIssue: string | null;
  cacheDir: string | null;
  pastEscapes: readonly string[];
  readConsumerFile?: (repo: string, path: string) => Promise<string | null>;
  author?: string;
}

export interface StaticStageResult {
  slices: Slices;
  findings: ModelFinding[];
  signals: RiskSignals;
  isSync: boolean;
  isRelease: boolean;
  files: AnalyzedFile[];
}

// reads the changed files at the head commit, walks each one once, and cuts the facts down to the
// slices, the direct findings and the risk signals; every read goes through git at a pinned commit,
// so the stage never depends on the state of a working tree
export async function runStaticStage(options: RunStaticStageOptions): Promise<StaticStageResult> {
  const change = options.change;

  const headPaths = await readTreePaths(options, change.head);

  const known = new Set(headPaths);
  const changedPaths = new Set(change.files.map((file) => file.path));

  const contextPaths = collectContextPaths(change.files, headPaths, options.config).filter(
    (path) => !changedPaths.has(path),
  );

  const manifestPaths = headPaths.filter(
    (path) => basename(path) === 'package.json' && !path.includes('node_modules/'),
  );

  const workflowPaths = headPaths.filter((path) => isWorkflowFile(path));

  const readable = change.files
    .filter((file) => file.status !== 'deleted' && !file.binary)
    .map((file) => file.path);

  const headTexts = await readFilesAtCommit(options.runner, options.repoDir, change.head, [
    ...new Set([...readable, ...contextPaths, ...manifestPaths, ...workflowPaths]),
  ]);

  const changed = change.files.map((file) =>
    buildAnalyzedFile(file, headTexts.get(file.path) ?? null, false, options.config),
  );

  const checkFiles = changed.filter(
    (entry) =>
      entry.file.status !== 'added' &&
      entry.analysis?.security.some((item) => item.part === 'allow-deny-check') === true,
  );

  // the base side of each changed manifest, of each deleted code file, whose exports leave with it,
  // of each modified workflow file, which the synced-copy check compares as YAML, and of each changed
  // file that holds an access check, whose body the hostile-input check compares
  const basePaths = [
    ...change.files
      .filter(
        (file) =>
          (basename(file.path) === 'package.json' && file.status !== 'added') ||
          (file.status === 'deleted' && file.kind === 'code') ||
          (file.status === 'modified' && isWorkflowFile(file.path)),
      )
      .map((file) => file.oldPath ?? file.path),
    ...checkFiles.map((entry) => entry.file.oldPath ?? entry.file.path),
  ];

  const baseTexts = await readFilesAtCommit(options.runner, options.repoDir, change.base, [
    ...new Set(basePaths),
  ]);

  const baseChecks = collectBaseChecks(checkFiles, baseTexts, options.config);

  const context = contextPaths
    .filter((path) => known.has(path))
    .map((path) =>
      buildAnalyzedFile(
        buildContextFile(path, options.config),
        headTexts.get(path) ?? null,
        true,
        options.config,
      ),
    );

  const manifests = manifestPaths.flatMap((path) => {
    const manifest = parsePackageManifest(path, headTexts.get(path) ?? '');

    return manifest === null ? [] : [manifest];
  });

  const baseManifests = new Map<string, PackageManifest>();

  for (const file of change.files) {
    const basePath = file.oldPath ?? file.path;
    const manifest = parsePackageManifest(basePath, baseTexts.get(basePath) ?? '');

    if (manifest !== null) {
      baseManifests.set(file.path, manifest);
    }
  }

  const functionSlices = buildFunctionSlices(changed);
  const fileSlices = buildFileSlices(changed, headPaths, options.config);
  const hasNewFunction = functionSlices.functions.some((entry) => entry.isNew);

  const index = hasNewFunction
    ? await loadBaseIndex({
        runner: options.runner,
        repoDir: options.repoDir,
        base: change.base,
        config: options.config,
        cacheDir: options.cacheDir,
      })
    : [];

  const slices: Slices = {
    functions: functionSlices.functions,
    reuse: buildReuseSlice(functionSlices.functions, changed, index, options.config.thresholds),
    guards: functionSlices.guards,
    throws: functionSlices.throws,
    writes: functionSlices.writes,
    security: fileSlices.security,
    edges: buildEdgeSlice({
      files: changed.map((entry) =>
        entry.file.status === 'deleted'
          ? buildAnalyzedFile(
              entry.file,
              baseTexts.get(entry.file.oldPath ?? entry.file.path) ?? null,
              false,
              options.config,
            )
          : entry,
      ),
      manifests,
      config: options.config,
    }),
    config: fileSlices.config,
    tests: fileSlices.tests,
    instructions: fileSlices.instructions,
    prose: fileSlices.prose,
    comments: fileSlices.comments,
    typeClaims: fileSlices.typeClaims,
    scripts: buildScriptSlice({
      files: changed,
      manifests,
      workflowTexts: workflowPaths.flatMap((path) => headTexts.get(path) ?? []),
      config: options.config,
    }),
    interfaces: fileSlices.interfaces,
    migrations: fileSlices.migrations,
    events: functionSlices.events,
  };

  const isSync =
    change.files.length > 0 &&
    change.files.every((file) => isGlobMatch(file.path, options.config.synced));

  const all = [...changed, ...context];

  const consumerManifests = await readConsumerManifests(options);

  const findings = [
    ...collectTestFindings(all, slices.security, baseChecks, {
      body: options.body,
      pullRequestAndMergePaths: [
        ...(change.baseOnly ?? [])
          .filter((file) => file.status !== 'deleted')
          .map((file) => file.path),
        ...(change.pullRequestPaths ?? []),
      ],
      headPaths,
    }),
    ...collectInstructionFindings(all, slices.instructions),
    ...collectChangeFindings({
      files: all,
      manifests,
      baseManifests,
      baseTexts,
      consumerManifests,
      config: options.config,
      linkedIssue: options.linkedIssue,
      isSync,
      isSyncAuthor:
        options.author !== undefined && options.config.syncAuthors.includes(options.author),
    }),
  ];

  return {
    slices,
    findings,
    signals: buildRiskSignals({
      change,
      slices,
      manifests,
      config: options.config,
      title: options.title,
      body: options.body,
      pastEscapes: options.pastEscapes,
    }),
    isSync,
    isRelease: isReleaseChange(change.files, baseTexts, headTexts),
    files: changed,
  };
}

async function readTreePaths(options: RunStaticStageOptions, commit: string): Promise<string[]> {
  const result = await options.runner.run(['git', 'ls-tree', '-r', '--name-only', '-z', commit], {
    cwd: options.repoDir,
  });

  if (result.exitCode !== 0) {
    throw new Error(`git ls-tree failed: ${result.stderr.trim()}`);
  }

  return result.stdout.split('\0').filter((path) => path !== '');
}

// the unchanged files a check reads beside the change: the test file beside each changed source, and
// every instruction file an agent loads beside a changed one
function collectContextPaths(
  files: readonly ChangedFile[],
  headPaths: readonly string[],
  config: ReviewConfig,
): string[] {
  const paths = new Set<string>();

  const instructions = headPaths.filter((path) => isGlobMatch(path, config.instructions));

  for (const file of files) {
    // a test of a source sits beside it or in a __tests__ folder beside it, as .test or .spec
    if (file.kind === 'code') {
      const stem = basename(file.path).replace(/\.[cm]?[jt]sx?$/u, '.');
      const directory = dirname(file.path);

      const testDirs = new Set([directory, join(directory, '__tests__')]);

      for (const path of headPaths) {
        if (
          testDirs.has(dirname(path)) &&
          basename(path).startsWith(stem) &&
          pickFileKind(path, config) === 'test'
        ) {
          paths.add(path);
        }
      }
    }

    if (file.kind === 'instructions') {
      for (const path of instructions) {
        paths.add(path);
      }
    }
  }

  return [...paths];
}

function buildAnalyzedFile(
  file: ChangedFile,
  text: string | null,
  isContext: boolean,
  config: ReviewConfig,
): AnalyzedFile {
  const parsed = text === null ? null : parseSource(file.path, text);

  return {
    file,
    isContext,
    text,
    parsed,
    analysis: parsed === null ? null : collectSourceFacts(parsed, config.stack),
    lines: buildChangedLines(file),
  };
}

// the body of each access check at the base side of a changed file, keyed by the file's head path
function collectBaseChecks(
  files: readonly AnalyzedFile[],
  baseTexts: ReadonlyMap<string, string>,
  config: ReviewConfig,
): Map<string, string[]> {
  const checks = new Map<string, string[]>();

  for (const entry of files) {
    const basePath = entry.file.oldPath ?? entry.file.path;
    const baseText = baseTexts.get(basePath);
    const parsed = baseText === undefined ? null : parseSource(basePath, baseText);

    if (parsed === null) {
      continue;
    }

    const security = collectSourceFacts(parsed, config.stack).security;

    checks.set(
      entry.file.path,
      security.flatMap((item) =>
        item.part === 'allow-deny-check' && item.body !== undefined ? [item.body] : [],
      ),
    );
  }

  return checks;
}

function buildContextFile(path: string, config: ReviewConfig): ChangedFile {
  return {
    path,
    oldPath: path,
    status: 'modified',
    binary: false,
    kind: pickFileKind(path, config),
    hunks: [],
    addedLines: 0,
    deletedLines: 0,
  };
}

async function readConsumerManifests(options: RunStaticStageOptions): Promise<ConsumerManifest[]> {
  const reader = options.readConsumerFile;

  if (reader === undefined) {
    return [];
  }

  const manifests: ConsumerManifest[] = [];

  for (const consumer of options.config.consumers) {
    const text = await reader(consumer.repo, consumer.path);

    const manifest = text === null ? null : parsePackageManifest(consumer.path, text);

    if (manifest !== null) {
      manifests.push({ repo: consumer.repo, path: consumer.path, manifest });
    }
  }

  return manifests;
}
