import { createHash } from 'node:crypto';
import { basename, isAbsolute, join, normalize } from 'node:path';
import type { ReviewConfig, Rule, RulesFile } from '@noslop/contract';
import { reviewConfigSchema } from '@noslop/contract';
import { BUILT_IN_DEFAULTS } from './built-in-defaults';
import { formatConfigLocation } from './format-config-location';
import type { ConfigLayer } from './merge-config-layers';
import { mergeConfigLayers } from './merge-config-layers';
import type { ConfigLocation } from './parse-config-location';
import { parseConfigLocation } from './parse-config-location';
import { parseRulesFile } from './parse-rules-file';

export type GithubLocation = Extract<ConfigLocation, { kind: 'github' }>;

// reads one file from a remote config repo, read-only; null when the file does not exist
export type ReadRemoteFile = (location: GithubLocation) => Promise<string | null>;

export interface LoadConfigOptions {
  repoDir: string;
  readRemoteFile?: ReadRemoteFile;
}

export interface LoadedConfig {
  config: ReviewConfig;
  sources: Record<string, string>;
  chain: string[];
  rules: Rule[] | null;
  hash: string;
}

export const BUILT_IN_SOURCE = 'built-in';
const CONFIG_FILE = 'review.json';

// starts from the built-in defaults and merges each file of the extends chain over them, from the root
// parent down to the repo's own review.json; a cycle in the chain fails the load
export async function loadConfig(options: LoadConfigOptions): Promise<LoadedConfig> {
  const files = await readChain(options);

  const layers: ConfigLayer[] = [
    { source: BUILT_IN_SOURCE, value: { ...BUILT_IN_DEFAULTS } },
    ...files.map((file) => ({ source: formatConfigLocation(file.location), value: file.value })),
  ];

  const merged = mergeConfigLayers(layers);
  const value: Record<string, unknown> = { ...merged.value };

  // a nullable key that a layer removed means none, as in the defaults
  for (const [key, fallback] of Object.entries(BUILT_IN_DEFAULTS)) {
    if (fallback === null && !(key in value)) {
      value[key] = null;
    }
  }

  const parsed = reviewConfigSchema.safeParse(value);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);

    throw new Error(`the merged config is not valid:\n${issues.join('\n')}`);
  }

  const config = parsed.data;
  const sources = config.rules === null ? null : await readRulesSources(config.rules, options);
  const hash = createHash('sha256').update(JSON.stringify(config));

  for (const source of sources ?? []) {
    hash.update(`\n${source.label}\n${source.text}`);
  }

  return {
    config,
    sources: merged.sources,
    chain: files.map((file) => formatConfigLocation(file.location)),
    rules: sources === null ? null : sources.flatMap((source) => buildRules(source)),
    hash: hash.digest('hex').slice(0, 16),
  };
}

interface ChainFile {
  location: ConfigLocation;
  value: Record<string, unknown>;
}

async function readChain(options: LoadConfigOptions): Promise<ChainFile[]> {
  const chain: ChainFile[] = [];

  const seen = new Set<string>();

  let location: ConfigLocation | null = { kind: 'local', path: join(options.repoDir, CONFIG_FILE) };
  let required = false;

  while (location !== null) {
    const label = formatConfigLocation(location);

    if (seen.has(label)) {
      throw new Error(`the extends chain has a cycle at ${label}`);
    }

    seen.add(label);

    const text = await readLocation(location, options);

    if (text === null) {
      if (required) {
        throw new Error(`the config ${label} does not exist`);
      }

      break;
    }

    const value = parseConfigFile(text, label);
    const parent = value['extends'];

    delete value['extends'];

    if (value['rules'] !== undefined && value['rules'] !== null) {
      value['rules'] = resolveRulesFiles(value['rules'], location);
    }

    chain.unshift({ location, value });

    location =
      typeof parent === 'string' ? parseConfigLocation(parent, location, CONFIG_FILE) : null;

    required = true;
  }

  return chain;
}

function parseConfigFile(text: string, label: string): Record<string, unknown> {
  let value: unknown;

  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`the config ${label} is not valid JSON`);
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`the config ${label} is not a JSON object`);
  }

  const parent: unknown = Reflect.get(value, 'extends');

  if (parent !== undefined && typeof parent !== 'string') {
    throw new Error(`extends in ${label} is not a string`);
  }

  return { ...value };
}

// a config file writes one path or a list of paths and rules files; each path resolves against the
// file that names it, and keeps the path as written for its label; a shape the schema refuses passes
// through for the schema to report
function resolveRulesFiles(raw: unknown, from: ConfigLocation): unknown[] {
  return (Array.isArray(raw) ? raw : [raw]).map((entry: unknown) => resolveRulesFile(entry, from));
}

function resolveRulesFile(entry: unknown, from: ConfigLocation): unknown {
  if (typeof entry === 'string') {
    return resolveRulesFile({ path: entry }, from);
  }

  if (typeof entry !== 'object' || entry === null) {
    return entry;
  }

  const path: unknown = Reflect.get(entry, 'path');

  if (typeof path !== 'string') {
    return entry;
  }

  return {
    label: buildRulesLabel(path),
    ...entry,
    path: formatConfigLocation(parseConfigLocation(path, from, CONFIG_FILE)),
  };
}

// a label reaches prompts, rule names and finding IDs, so an absolute path gives only its file name,
// which keeps a machine's folders out of them
function buildRulesLabel(path: string): string {
  if (path.startsWith('github:')) {
    return path;
  }

  return isAbsolute(path) ? basename(path) : normalize(path);
}

interface RulesSource {
  label: string;
  text: string;
  skip: readonly string[];
}

function readRulesSources(
  files: readonly RulesFile[],
  options: LoadConfigOptions,
): Promise<RulesSource[]> {
  return Promise.all(
    files.map(async (file) => {
      // the chain has resolved each path against the file that names it already
      const location: ConfigLocation = file.path.startsWith('github:')
        ? parseConfigLocation(file.path, { kind: 'local', path: file.path }, CONFIG_FILE)
        : { kind: 'local', path: file.path };

      const text = await readLocation(location, options);

      if (text === null) {
        throw new Error(`the rules file ${file.path} does not exist`);
      }

      return { label: file.label ?? file.path, text, skip: file.skip ?? [] };
    }),
  );
}

// a skipped heading names a section that holds no rule, such as how to load a skill
function buildRules(source: RulesSource): Rule[] {
  return parseRulesFile(source.text)
    .filter((section) => !source.skip.includes(section.name))
    .map((section) => ({ name: `${source.label}: ${section.name}`, body: section.body }));
}

async function readLocation(
  location: ConfigLocation,
  options: LoadConfigOptions,
): Promise<string | null> {
  if (location.kind === 'github') {
    if (options.readRemoteFile === undefined) {
      throw new Error(`no reader for the remote config ${formatConfigLocation(location)}`);
    }

    return options.readRemoteFile(location);
  }

  const file = Bun.file(location.path);

  const exists = await file.exists();

  return exists ? file.text() : null;
}
