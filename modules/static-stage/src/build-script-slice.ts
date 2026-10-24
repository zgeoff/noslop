import type { ReviewConfig } from '@noslop/contract';
import type { AnalyzedFile, PackageManifest } from './analyzed-file';
import { isGlobMatch } from './is-glob-match';
import { isInPackage } from './is-in-package';

export interface ScriptSliceInputs {
  files: readonly AnalyzedFile[];

  manifests: readonly PackageManifest[];
  workflowTexts: readonly string[];
  config: ReviewConfig;
}

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
    .filter((manifest) => isInPackage(manifest, path))
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

function buildPathPattern(path: string): RegExp {
  return new RegExp(`(?<![\\w./-])(?:\\./)?${RegExp.escape(path)}(?![\\w./-])`, 'u');
}
