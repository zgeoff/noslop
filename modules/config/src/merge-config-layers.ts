export interface ConfigLayer {
  source: string;
  value: Record<string, unknown>;
}

export interface MergedLayers {
  value: Record<string, unknown>;

  // the source of each leaf, by its dotted key path; an array is one leaf
  sources: Record<string, string>;
}

// merges each layer over the ones before it by 3 rules: objects merge by key, arrays replace, and null
// removes the key the layers before it set
export function mergeConfigLayers(layers: readonly ConfigLayer[]): MergedLayers {
  let merged: MergedLayers = { value: {}, sources: {} };

  for (const layer of layers) {
    merged = mergeObject(merged, layer.value, layer.source, '');
  }

  return merged;
}

function mergeObject(
  base: MergedLayers,
  layer: Record<string, unknown>,
  source: string,
  prefix: string,
): MergedLayers {
  const value: Record<string, unknown> = { ...base.value };
  let sources = { ...base.sources };

  for (const [key, next] of Object.entries(layer)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    const current = value[key];

    if (next === null) {
      delete value[key];
      sources = removeSourcesUnder(sources, path);
      continue;
    }

    // a new object merges against an empty one, so a null inside it removes its key too
    if (isPlainObject(next)) {
      const inherited = isPlainObject(current)
        ? { value: current, sources: pickSourcesUnder(sources, path) }
        : { value: {}, sources: {} };

      const child = mergeObject(inherited, next, source, path);

      // an empty object is a leaf of its own; once it holds keys, its keys are the leaves
      const childSources =
        Object.keys(child.value).length === 0
          ? { [path]: source }
          : Object.fromEntries(Object.entries(child.sources).filter(([leaf]) => leaf !== path));

      value[key] = child.value;
      sources = { ...removeSourcesUnder(sources, path), ...childSources };
      continue;
    }

    value[key] = next;
    sources = { ...removeSourcesUnder(sources, path), ...collectLeafSources(next, source, path) };
  }

  return { value, sources };
}

function removeSourcesUnder(sources: Record<string, string>, path: string): Record<string, string> {
  return Object.fromEntries(Object.entries(sources).filter(([key]) => !isUnder(key, path)));
}

function isUnder(key: string, path: string): boolean {
  return key === path || key.startsWith(`${path}.`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickSourcesUnder(sources: Record<string, string>, path: string): Record<string, string> {
  return Object.fromEntries(Object.entries(sources).filter(([key]) => isUnder(key, path)));
}

function collectLeafSources(value: unknown, source: string, path: string): Record<string, string> {
  if (!isPlainObject(value) || Object.keys(value).length === 0) {
    return { [path]: source };
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) =>
      Object.entries(collectLeafSources(child, source, `${path}.${key}`)),
    ),
  );
}
