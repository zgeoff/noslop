import type { ReviewConfig } from '@noslop/contract';
import type { AnalyzedFile, PackageManifest } from './analyzed-file';
import { isGlobMatch } from './is-glob-match';

export interface ScriptSliceInputs {
  files: readonly AnalyzedFile[];

  // every package.json at the head commit, and the text of every workflow file there
  manifests: readonly PackageManifest[];
  workflowTexts: readonly string[];
  config: ReviewConfig;
}

// each code file the change adds under the config's script globs that the repo never runs again: no
// package.json script names it from its package's folder, and no workflow names it from the repo root
// or from a package's folder
export function buildScriptSlice(inputs: ScriptSliceInputs): string[] {
  return inputs.files
    .filter(
      (entry) =>
        entry.file.status === 'added' &&
        entry.file.kind === 'code' &&
        isGlobMatch(entry.file.path, inputs.config.scripts),
    )
    .map((entry) => entry.file.path)
    .filter((path) => !isScriptRun(path, inputs));
}

function isScriptRun(path: string, inputs: ScriptSliceInputs): boolean {
  const owners = inputs.manifests
    .filter((manifest) => manifest.directory === '.' || path.startsWith(`${manifest.directory}/`))
    .map((manifest) => ({
      manifest,
      relative: manifest.directory === '.' ? path : path.slice(manifest.directory.length + 1),
    }));

  const workflowPatterns = [path, ...owners.map((owner) => owner.relative)].map((candidate) =>
    buildPathPattern(candidate),
  );

  return (
    owners.some((owner) =>
      owner.manifest.scriptCommands.some((command) =>
        buildPathPattern(owner.relative).test(command),
      ),
    ) || inputs.workflowTexts.some((text) => workflowPatterns.some((pattern) => pattern.test(text)))
  );
}

// a command names the path as a whole word, with or without a leading `./`, so `scripts/build.ts`
// never matches `scripts/build.ts.bak` or `tools/scripts/build.ts`
function buildPathPattern(path: string): RegExp {
  return new RegExp(`(?<![\\w./-])(?:\\./)?${RegExp.escape(path)}(?![\\w./-])`, 'u');
}
