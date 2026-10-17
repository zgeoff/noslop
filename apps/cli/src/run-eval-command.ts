import { writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadConfig } from '@noslop/config';
import type { CaseRun, RunComparison } from '@noslop/eval';
import {
  buildRunComparison,
  buildRunScore,
  loadCorpus,
  loadRuns,
  renderEvalReport,
  runEval,
} from '@noslop/eval';
import { buildConfiguredAdapter } from './build-configured-adapter';
import type { CLIContext } from './cli-context';
import { createNoslopReviewer } from './create-noslop-reviewer';

export interface EvalValues {
  corpus: string;
  limit: string | undefined;
  baseline: string | undefined;
  noiseFloor: string | undefined;
  out: string | undefined;
  adapter: string | undefined;
  json: boolean;
}

// a reported finding matches a labelled one on the same path within this many lines
const WINDOW_LINES = 5;

// replays the first cases of the corpus through noslop with the working directory's config, and
// writes the runs to the out folder as each case ends; a recorded baseline run scores beside noslop's,
// and 2 recorded runs of the reference reviewer give the noise floor
export async function runEvalCommand(values: EvalValues, ctx: CLIContext): Promise<number> {
  const all = await loadCorpus(resolve(ctx.cwd, values.corpus));

  const limit = values.limit === undefined ? all.length : Number(values.limit);

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`--limit takes a positive whole number, not ${values.limit ?? ''}`);
  }

  const cases = all.slice(0, limit);

  const caseIDs = new Set(cases.map((item) => item.id));

  const reference = await loadReference(values.baseline, ctx, caseIDs);
  const noiseFloor = await loadNoiseFloor(values.noiseFloor, ctx, caseIDs);
  const loaded = await loadConfig({ repoDir: ctx.cwd });

  const adapterID = values.adapter ?? loaded.config.adapter ?? 'codex';

  const adapter = buildConfiguredAdapter(
    ctx.createAdapter(adapterID),
    loaded.config.adapters[adapterID] ?? {},
  );

  const outDir = resolve(ctx.cwd, values.out ?? join(ctx.cacheDir, 'eval', `run-${Date.now()}`));
  const workDir = join(outDir, 'work');

  await mkdir(workDir, { recursive: true });

  const reviewer = createNoslopReviewer({ ctx, loaded, adapter, tempDir: workDir });
  const done: CaseRun[] = [];

  const runs = await runEval({
    cases,
    reviewer,
    runner: ctx.runner,
    workDir,
    onCase: (run) => {
      done.push(run);

      ctx.logger.info('case {caseID}: {count} findings', {
        caseID: run.caseID,
        count: run.review.failed ? 'failed' : run.review.findings.length,
      });

      // a synchronous write, so the file on disk always holds the cases that ended, in order
      writeFileSync(join(outDir, 'runs.json'), JSON.stringify(done, null, 2));
    },
  });

  const score = buildRunScore(cases, runs, WINDOW_LINES);

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

  await Bun.write(join(outDir, 'report.md'), report);
  await Bun.write(join(outDir, 'score.json'), JSON.stringify(summary, null, 2));

  const output = values.json ? `${JSON.stringify(summary, null, 2)}\n` : report;

  ctx.writeStdout(output);

  return 0;
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

// takes the 2 recorded runs as one value, their paths joined by a comma
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
