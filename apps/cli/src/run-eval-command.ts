import { writeFileSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Depth } from '@noslop/contract';
import { depthSchema } from '@noslop/contract';
import type { CaseRun, RunComparison } from '@noslop/eval';
import {
  buildRunComparison,
  buildRunScore,
  loadCorpus,
  loadRuns,
  readHeadFiles,
  renderEvalReport,
  requireCasePaths,
  runEval,
} from '@noslop/eval';
import { buildConfiguredAdapter } from './build-configured-adapter';
import type { CLIContext } from './cli-context';
import { createNoslopReviewer } from './create-noslop-reviewer';
import { loadRepoConfig } from './load-repo-config';
import { resolveRepoDir } from './resolve-repo-dir';
import { runStaticEvalCommand } from './run-static-eval-command';

export interface EvalValues {
  corpus: string;
  limit: string | undefined;
  baseline: string | undefined;
  noiseFloor: string | undefined;
  out: string | undefined;
  adapter: string | undefined;
  json: boolean;

  resume: boolean;

  static: boolean;

  depth: string | undefined;
}

const WINDOW_LINES = 5;

export async function runEvalCommand(values: EvalValues, ctx: CLIContext): Promise<number> {
  const all = await loadCorpus(resolve(ctx.cwd, values.corpus));

  const limit = values.limit === undefined ? all.length : Number(values.limit);

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`--limit takes a positive whole number, not ${values.limit ?? ''}`);
  }

  const cases = all.slice(0, limit);
  const depth = parseDepthFlag(values.depth);

  if (values.static) {
    return runStaticEvalCommand(cases, values, depth, ctx);
  }

  await Promise.all(
    cases.map(async (item) => {
      const files = await readHeadFiles(item, ctx.runner);

      requireCasePaths(item, files);
    }),
  );

  const caseIDs = new Set(cases.map((item) => item.id));

  const reference = await loadReference(values.baseline, ctx, caseIDs);
  const noiseFloor = await loadNoiseFloor(values.noiseFloor, ctx, caseIDs);
  const repoDir = await resolveRepoDir(ctx);
  const loaded = await loadRepoConfig(ctx, repoDir);

  const adapterID = values.adapter ?? loaded.config.adapter ?? 'codex';

  const adapter = buildConfiguredAdapter(
    ctx.createAdapter(adapterID),
    loaded.config.adapters[adapterID] ?? {},
  );

  const outDir = resolve(ctx.cwd, values.out ?? join(ctx.cacheDir, 'eval', `run-${Date.now()}`));
  const workDir = join(outDir, 'work');

  await mkdir(workDir, { recursive: true });

  const reviewer = createNoslopReviewer({
    ctx,
    loaded,
    adapter,
    depth,
    tempDir: workDir,
    loadCaseConfig: (caseRepo) => loadRepoConfig(ctx, repoDir, { rulesRepoDir: caseRepo }),
  });

  const done = values.resume ? await loadDoneRuns(join(outDir, 'runs.json'), caseIDs) : [];

  const doneIDs = new Set(done.map((run) => run.caseID));

  await runEval({
    cases: cases.filter((item) => !doneIDs.has(item.id)),
    reviewer,
    runner: ctx.runner,
    workDir,
    parallel: loaded.config.thresholds.parallelCases,
    onCase: (run) => {
      done.push(run);

      ctx.logger.info('case {caseID}: {count} findings', {
        caseID: run.caseID,
        count: run.review.failed ? 'failed' : run.review.findings.length,
      });

      const ordered = cases.flatMap((item) => done.filter((ended) => ended.caseID === item.id));

      writeFileSync(join(outDir, 'runs.json'), JSON.stringify(ordered, null, 2));
    },
  });

  const score = buildRunScore(cases, done, WINDOW_LINES);

  const scoredReference =
    reference === null
      ? null
      : { reviewer: 'baseline', score: buildRunScore(cases, reference, WINDOW_LINES) };

  const report = renderEvalReport({
    reviewer: reviewer.id,
    score,
    reference: scoredReference,
    noiseFloor,
  });

  const summary = { outDir, score, reference: scoredReference?.score ?? null, noiseFloor };

  await rm(workDir, { recursive: true, force: true });

  await Bun.write(join(outDir, 'report.md'), report);
  await Bun.write(join(outDir, 'score.json'), JSON.stringify(summary, null, 2));

  const output = values.json ? `${JSON.stringify(summary, null, 2)}\n` : report;

  ctx.writeStdout(output);

  return 0;
}

function parseDepthFlag(value: string | undefined): Depth | null {
  if (value === undefined) {
    return null;
  }

  const parsed = depthSchema.safeParse(value);

  if (!parsed.success) {
    throw new Error(`--depth takes light, standard or deep, not ${value}`);
  }

  return parsed.data;
}

async function loadReference(
  path: string | undefined,
  ctx: CLIContext,
  caseIDs: ReadonlySet<string>,
): Promise<CaseRun[] | null> {
  if (path === undefined) {
    return null;
  }

  const runs = await loadRuns(resolve(ctx.cwd, path));

  return runs.filter((run) => caseIDs.has(run.caseID));
}

async function loadNoiseFloor(
  paths: string | undefined,
  ctx: CLIContext,
  caseIDs: ReadonlySet<string>,
): Promise<RunComparison | null> {
  if (paths === undefined) {
    return null;
  }

  const [first, second, ...rest] = paths.split(',');

  if (first === undefined || second === undefined || rest.length > 0) {
    throw new Error('--noise-floor takes 2 recorded runs, joined by a comma');
  }

  const firstRuns = await loadReference(first, ctx, caseIDs);
  const secondRuns = await loadReference(second, ctx, caseIDs);

  return buildRunComparison(firstRuns ?? [], secondRuns ?? [], WINDOW_LINES);
}

async function loadDoneRuns(path: string, caseIDs: ReadonlySet<string>): Promise<CaseRun[]> {
  const exists = await Bun.file(path).exists();

  if (!exists) {
    return [];
  }

  const runs = await loadRuns(path);

  return runs.filter((run) => caseIDs.has(run.caseID));
}
