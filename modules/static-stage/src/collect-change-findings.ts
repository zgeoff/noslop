import { basename } from 'node:path';
import type { ModelFinding, ReviewConfig } from '@noslop/contract';
import type { AnalyzedFile, PackageManifest } from './analyzed-file';
import { buildStaticFinding } from './build-static-finding';
import { isGlobMatch } from './is-glob-match';
import { isWorkflowFile } from './is-workflow-file';
import type { SourceLocation } from './types';

export interface ConsumerManifest {
  repo: string;
  path: string;
  manifest: PackageManifest;
}

export interface ChangeFindingInputs {
  files: readonly AnalyzedFile[];
  manifests: readonly PackageManifest[];
  baseManifests: ReadonlyMap<string, PackageManifest>;

  baseTexts: ReadonlyMap<string, string>;
  consumerManifests: readonly ConsumerManifest[];
  config: ReviewConfig;
  linkedIssue: string | null;
  isSync: boolean;

  isSyncAuthor: boolean;
}

export function collectChangeFindings(inputs: ChangeFindingInputs): ModelFinding[] {
  return [
    ...collectRefusedBumps(inputs),
    ...collectBoundsOverLimit(inputs),
    ...collectSyncedEdits(inputs),
    ...collectStrayFormatHunks(inputs),
    ...collectMissingBumps(inputs),
  ];
}

function collectRefusedBumps(inputs: ChangeFindingInputs): ModelFinding[] {
  return inputs.manifests.flatMap((manifest) => {
    const before = inputs.baseManifests.get(manifest.path);

    if (
      manifest.name === null ||
      manifest.version === null ||
      before === undefined ||
      before.version === manifest.version
    ) {
      return [];
    }

    const name = manifest.name;
    const version = manifest.version;

    const dependents = [
      ...inputs.manifests
        .filter((other) => other.path !== manifest.path)
        .map((other) => ({ label: other.path, range: other.dependencies[name] })),
      ...inputs.consumerManifests.map((consumer) => ({
        label: `${consumer.repo} ${consumer.path}`,
        range: consumer.manifest.dependencies[name],
      })),
    ];

    return dependents.flatMap((dependent) => {
      const range = dependent.range;

      if (range === undefined || /^(?:workspace|catalog|file|link|git|https?):/u.test(range)) {
        return [];
      }

      if (Bun.semver.satisfies(version, range)) {
        return [];
      }

      return [
        buildStaticFinding({
          title: `Version ${version} of ${name} falls outside a consumer's range`,
          body: `${dependent.label} pins ${name} at ${range}, which ${version} does not satisfy, so that consumer cannot take the release.`,
          anchor: getVersionLocation(manifest),
          criterion: 'outage',
        }),
      ];
    });
  });
}

function getVersionLocation(manifest: PackageManifest): SourceLocation {
  return { path: manifest.path, startLine: manifest.versionLine, endLine: manifest.versionLine };
}

function collectBoundsOverLimit(inputs: ChangeFindingInputs): ModelFinding[] {
  return inputs.files.flatMap((entry) =>
    (entry.analysis?.schemaBounds ?? []).flatMap((bound) => {
      const limit = inputs.config.limits[bound.property];

      if (
        entry.isContext ||
        limit === undefined ||
        bound.max <= limit ||
        !entry.lines.touched.has(bound.line)
      ) {
        return [];
      }

      return [
        buildStaticFinding({
          title: `Schema lets "${bound.property}" reach ${bound.max}, above the limit of ${limit}`,
          body: `The schema accepts a "${bound.property}" up to ${bound.max}, and the downstream limit is ${limit}, so a valid input fails downstream.`,
          anchor: { path: entry.file.path, startLine: bound.line, endLine: bound.line },
          criterion: 'wrong-behaviour-edge-path',
          fix: `Bound "${bound.property}" at ${limit} or less.`,
        }),
      ];
    }),
  );
}

function collectSyncedEdits(inputs: ChangeFindingInputs): ModelFinding[] {
  if (inputs.isSync || inputs.isSyncAuthor) {
    return [];
  }

  return inputs.files
    .filter(
      (entry) =>
        !entry.isContext &&
        isGlobMatch(entry.file.path, inputs.config.synced) &&
        !isWorkflowPinOnly(entry, inputs.baseTexts.get(entry.file.path) ?? null),
    )
    .map((entry) =>
      buildStaticFinding({
        title: `Edit to the synced copy ${basename(entry.file.path)}`,
        body: `${entry.file.path} is a synced copy, so the next sync from its source overwrites this edit.`,
        anchor: findFirstChange(entry),
        criterion: 'intent-mismatch',
        fix: 'Make the change in the source repo, and let the sync bring it here.',
      }),
    );
}

function isWorkflowPinOnly(entry: AnalyzedFile, baseText: string | null): boolean {
  return (
    entry.file.status === 'modified' &&
    isWorkflowFile(entry.file.path) &&
    baseText !== null &&
    entry.text !== null &&
    hasOnlyCallRefChanges(baseText, entry.text) &&
    hasOnlyCallLineChanges(entry)
  );
}

function hasOnlyCallRefChanges(before: string, after: string): boolean {
  const left = tryParseYAML(before);
  const right = tryParseYAML(after);

  return (
    left.ok &&
    right.ok &&
    Bun.deepEquals(normalizeCallRefs(left.value), normalizeCallRefs(right.value), true)
  );
}

function tryParseYAML(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: Bun.YAML.parse(text) };
  } catch {
    return { ok: false };
  }
}

const WORKFLOW_CALL = /^[^\s@/]+\/[^\s@/]+\/\.github\/workflows\/[^\s@]+\.ya?ml@\S+$/u;

function normalizeCallRefs(document: unknown): unknown {
  if (!isRecord(document) || !isRecord(document['jobs'])) {
    return document;
  }

  const jobs = Object.fromEntries(
    Object.entries(document['jobs']).map(([id, job]) => {
      const uses = isRecord(job) ? job['uses'] : undefined;

      return typeof uses === 'string' && isRecord(job) && WORKFLOW_CALL.test(uses)
        ? [id, { ...job, uses: uses.slice(0, uses.indexOf('@')) }]
        : [id, job];
    }),
  );

  return { ...document, jobs };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// a YAML parse drops comments and layout, so each changed line must also be a `uses:` line whose
// text outside the ref stays the same
function hasOnlyCallLineChanges(entry: AnalyzedFile): boolean {
  return (
    entry.file.hunks.length > 0 &&
    entry.file.hunks.every((hunk) => {
      const deleted = hunk.lines.filter((line) => line.kind === 'deleted');
      const added = hunk.lines.filter((line) => line.kind === 'added');

      return (
        deleted.length === added.length &&
        deleted.every((line, index) => {
          const before = findWorkflowCall(line.text);
          const after = findWorkflowCall(added[index]?.text ?? '');

          return before !== null && before === after;
        })
      );
    })
  );
}

function findWorkflowCall(text: string): string | null {
  // a quoted call ends at its closing quote, and YAML starts a comment only at a # after whitespace,
  // so a # inside the quotes or inside a bare ref belongs to the ref
  const match =
    /^(?<head>\s*(?:-\s+)?uses:\s*)(?:"(?<double>[^\s"'@/]+\/[^\s"'@/]+\/\.github\/workflows\/[^\s"'@]+\.ya?ml)@[^"]+"|'(?<single>[^\s"'@/]+\/[^\s"'@/]+\/\.github\/workflows\/[^\s"'@]+\.ya?ml)@[^']+'|(?<bare>[^\s"'@/]+\/[^\s"'@/]+\/\.github\/workflows\/[^\s"'@]+\.ya?ml)@[^\s"']+)(?<tail>(?:\s+#.*)?\s*)$/u.exec(
      text,
    );

  if (match?.groups === undefined) {
    return null;
  }

  const head = match.groups['head'] ?? '';
  const path = match.groups['double'] ?? match.groups['single'] ?? match.groups['bare'];
  const quote = text.charAt(head.length).replace(/[^"']/u, '');

  return `${head}${quote}${path}@${quote}${match.groups['tail'] ?? ''}`;
}

function findFirstChange(entry: AnalyzedFile): SourceLocation {
  const first = Math.min(...entry.lines.touched);
  const line = Number.isFinite(first) ? first : 1;

  return { path: entry.file.path, startLine: line, endLine: line };
}

function collectStrayFormatHunks(inputs: ChangeFindingInputs): ModelFinding[] {
  const issue = inputs.linkedIssue;

  if (issue === null) {
    return [];
  }

  return inputs.files.flatMap((entry) => {
    const path = entry.file.path;

    if (entry.isContext || issue.includes(path) || issue.includes(basename(path))) {
      return [];
    }

    return entry.file.hunks.flatMap((hunk) => {
      const deleted = hunk.lines.filter((line) => line.kind === 'deleted').map((line) => line.text);
      const added = hunk.lines.filter((line) => line.kind === 'added');
      const first = added[0]?.newLine;

      const isFormatOnly =
        deleted.length > 0 &&
        added.length > 0 &&
        normalizeSpace(deleted.join('')) ===
          normalizeSpace(added.map((line) => line.text).join(''));

      if (!isFormatOnly || first === undefined || first === null) {
        return [];
      }

      return [
        buildStaticFinding({
          title: `Format-only edit to ${basename(path)}, outside the linked issue`,
          body: 'The hunk changes only whitespace and line breaks, in a file the linked issue does not name, so it widens the change past its intent.',
          anchor: {
            path,
            startLine: first,
            endLine: Math.min(first + added.length - 1, first + 9),
          },
          criterion: 'intent-mismatch',
          fix: 'Drop the hunk, or move it to its own change.',
        }),
      ];
    });
  });
}

// whitespace inside a string literal is part of its value, so a change there is never format-only
function normalizeSpace(text: string): string {
  return text.replaceAll(
    /(?<quoted>"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|\s+/gu,
    '$<quoted>',
  );
}

function collectMissingBumps(inputs: ChangeFindingInputs): ModelFinding[] {
  const needing = new Map<string, PackageManifest>();

  for (const entry of inputs.files) {
    if (entry.isContext || !isGlobMatch(entry.file.path, inputs.config.versionBump)) {
      continue;
    }

    const [owner] = inputs.manifests
      .filter(
        (manifest) =>
          manifest.directory === '.' || entry.file.path.startsWith(`${manifest.directory}/`),
      )
      .toSorted((left, right) => right.directory.length - left.directory.length);

    if (owner !== undefined && !owner.isPrivate) {
      needing.set(owner.path, owner);
    }
  }

  const changed = new Set(
    inputs.files.filter((entry) => !entry.isContext).map((entry) => entry.file.path),
  );

  return [...needing.values()].flatMap((manifest) => {
    const before = changed.has(manifest.path) ? inputs.baseManifests.get(manifest.path) : manifest;

    if (before === undefined || before.version !== manifest.version) {
      return [];
    }

    return [
      buildStaticFinding({
        title: `${manifest.name ?? manifest.path} changes with no version bump`,
        body: `The change edits files that the release rules tie to a version bump, and ${manifest.path} keeps version ${manifest.version ?? 'unset'}.`,
        anchor: getVersionLocation(manifest),
        criterion: 'wrong-behaviour-edge-path',
        missingChange: true,
        fix: `Bump the version in ${manifest.path}.`,
      }),
    ];
  });
}
