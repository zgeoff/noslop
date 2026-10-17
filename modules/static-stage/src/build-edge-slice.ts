import type { ReviewConfig } from '@noslop/contract';
import type { AnalyzedFile, PackageManifest } from './analyzed-file';
import type { EdgeEntry } from './types';

export interface EdgeInputs {
  files: readonly AnalyzedFile[];
  manifests: readonly PackageManifest[];
  config: ReviewConfig;
}

// each changed export, schema bound and package manifest whose package another package uses: a
// workspace package that depends on it, or a consumer in the config that pins it; a change nothing
// consumes is no edge, so the cross-repo lens stays off
export function buildEdgeSlice(inputs: EdgeInputs): EdgeEntry[] {
  const edges: EdgeEntry[] = [];

  for (const entry of inputs.files) {
    const path = entry.file.path;
    const owner = findOwningManifest(path, inputs.manifests);

    if (owner?.name === null || owner === null) {
      continue;
    }

    const consumers = collectConsumers(owner, inputs);

    if (consumers.length === 0) {
      continue;
    }

    if (path === owner.path) {
      edges.push({
        location: { path, startLine: 1, endLine: 1 },
        kind: 'pin',
        name: owner.name,
        consumers,
      });

      continue;
    }

    for (const exported of entry.analysis?.exports ?? []) {
      if (entry.lines.touched.has(exported.line)) {
        edges.push({
          location: { path, startLine: exported.line, endLine: exported.line },
          kind: 'export',
          name: exported.name,
          consumers,
        });
      }
    }

    for (const bound of entry.analysis?.schemaBounds ?? []) {
      if (entry.lines.touched.has(bound.line)) {
        edges.push({
          location: { path, startLine: bound.line, endLine: bound.line },
          kind: 'schema',
          name: bound.property,
          consumers,
        });
      }
    }
  }

  return edges;
}

function findOwningManifest(
  path: string,
  manifests: readonly PackageManifest[],
): PackageManifest | null {
  const owners = manifests.filter(
    (manifest) =>
      manifest.dir === '.' || path === manifest.path || path.startsWith(`${manifest.dir}/`),
  );

  return owners.toSorted((left, right) => right.dir.length - left.dir.length)[0] ?? null;
}

function collectConsumers(owner: PackageManifest, inputs: EdgeInputs): EdgeEntry['consumers'] {
  const name = owner.name ?? '';

  const inRepo = inputs.manifests
    .filter((manifest) => manifest.path !== owner.path && name in manifest.dependencies)
    .map((manifest) => ({ repo: null, path: manifest.path }));

  const outside = inputs.config.consumers
    .filter((consumer) => consumer.pins.includes(name))
    .map((consumer) => ({ repo: consumer.repo, path: consumer.path }));

  return [...inRepo, ...outside];
}
