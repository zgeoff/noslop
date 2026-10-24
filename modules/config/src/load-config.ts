import { createHash } from 'node:crypto';
import { basename, dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import type { ReviewConfig, Rule, RulesFile } from '@noslop/contract';
import { reviewConfigSchema } from '@noslop/contract';
import { BUILT_IN_DEFAULTS } from './built-in-defaults';
import { formatConfigLocation } from './format-config-location';
import type { ConfigLayer } from './merge-config-layers';
import { mergeConfigLayers } from './merge-config-layers';
import type { ConfigLocation } from './parse-config-location';
import { parseConfigLocation } from './parse-config-location';

export type GithubLocation = Extract<ConfigLocation, { kind: 'github' }>;

export type ReadRemoteFile = (location: GithubLocation) => Promise<string | null>;

export type ReadLocalFile = (path: string) => Promise<string | null>;

export interface LoadConfigOptions {
  repoDir: string;
  readRemoteFile?: ReadRemoteFile;

  readLocalFile?: ReadLocalFile;

  rulesRepoDir?: string;
}

export interface LoadedConfig {
  config: ReviewConfig;
  sources: Record<string, string>;
  chain: string[];
  rules: Rule[] | null;

  missingRules: string[];

  hash: string;
}

export const BUILT_IN_SOURCE = 'built-in';

export async function loadConfig(options: LoadConfigOptions): Promise<LoadedConfig> {
  const files = await readChain(options);

  const layers: ConfigLayer[] = [
    { source: BUILT_IN_SOURCE, value: { ...BUILT_IN_DEFAULTS } },
    ...files.map((file) => ({
      source: formatConfigLocation(file.location),
      value: Object.fromEntries(Object.entries(file.value).filter(([key]) => key !== 'rules')),
    })),
  ];

  const merged = mergeConfigLayers(layers);
  const value: Record<string, unknown> = { ...merged.value };
  const sources = { ...merged.sources };
  const rulesLayer = mergeRulesLayers(files);

  if (rulesLayer !== null) {
    value['rules'] = rulesLayer.rules;
    sources['rules'] = rulesLayer.source;
  }

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
  const rules = config.rules === null ? null : await readRulesSources(config.rules, options);

  const hash = createHash('sha256').update(
    JSON.stringify(buildHashedConfig(config, options.repoDir)),
  );

  for (const source of rules ?? []) {
    hash.update(`\n${source.label}\n${source.text === null ? 'missing' : `text\n${source.text}`}`);
  }

  return {
    config,
    sources,
    chain: files.map((file) => formatConfigLocation(file.location)),
    rules: rules === null ? null : rules.flatMap((source) => buildRules(source)),
    missingRules: [
      ...new Set(
        (rules ?? []).flatMap((source) =>
          source.text === null && source.isExpected ? [source.label] : [],
        ),
      ),
    ],
    hash: hash.digest('hex').slice(0, 16),
  };
}

interface ChainFile {
  location: ConfigLocation;
  value: Record<string, unknown>;
}

const CONFIG_FILE = 'review.json';

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

    // Editors read `$schema` to find the JSON Schema of review.json; it sets no config value.
    delete value['extends'];
    delete value['$schema'];

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

  if (options.readLocalFile !== undefined) {
    return options.readLocalFile(location.path);
  }

  const file = Bun.file(location.path);

  const exists = await file.exists();

  return exists ? file.text() : null;
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

function resolveRulesFiles(raw: unknown, from: ConfigLocation): unknown[] {
  return (Array.isArray(raw) ? raw : [raw]).map((entry: unknown) => resolveRulesFile(entry, from));
}

const REPO_PREFIX = 'repo:';

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
    path: path.startsWith(REPO_PREFIX)
      ? `${REPO_PREFIX}${normalize(path.slice(REPO_PREFIX.length))}`
      : formatConfigLocation(parseConfigLocation(path, from, CONFIG_FILE)),
  };
}

function buildRulesLabel(path: string): string {
  if (path.startsWith('github:')) {
    return path;
  }

  if (path.startsWith(REPO_PREFIX)) {
    return normalize(path.slice(REPO_PREFIX.length));
  }

  return isAbsolute(path) ? basename(path) : normalize(path);
}

function mergeRulesLayers(files: readonly ChainFile[]): { rules: unknown; source: string } | null {
  let merged: { rules: unknown[] | null; source: string } | null = null;

  for (const file of files) {
    const next = file.value['rules'];

    if (next === undefined) {
      continue;
    }

    const source = formatConfigLocation(file.location);

    if (!Array.isArray(next)) {
      merged = { rules: null, source };
      continue;
    }

    const rules: unknown[] = [...(merged?.rules ?? [])];

    for (const entry of next) {
      const index = rules.findIndex((inherited: unknown) => isSamePath(inherited, entry));

      if (index === -1) {
        rules.push(entry);
      } else {
        rules[index] = entry;
      }
    }

    merged = { rules, source };
  }

  return merged;
}

function isSamePath(left: unknown, right: unknown): boolean {
  const path: unknown =
    typeof left === 'object' && left !== null ? Reflect.get(left, 'path') : undefined;

  return (
    typeof path === 'string' &&
    typeof right === 'object' &&
    right !== null &&
    Reflect.get(right, 'path') === path
  );
}

interface RulesSource {
  label: string;

  text: string | null;
  paths: readonly string[] | null;

  isExpected: boolean;
}

async function readRulesSources(
  files: readonly RulesFile[],
  options: LoadConfigOptions,
): Promise<RulesSource[]> {
  const sources = files.flatMap((file) => {
    const label = file.label ?? buildRulesLabel(file.path);
    const location = resolveRulesLocation(file.path, options);

    return [
      { location, label, paths: null, required: !file.path.startsWith(REPO_PREFIX), name: null },
      ...Object.entries(file.references ?? {}).map(([reference, paths]) => {
        const name = requireInnerPath(reference, 'reference');

        return {
          location: parseConfigLocation(name, location, CONFIG_FILE),
          label: normalize(join(dirname(label), reference)),
          paths,
          required: false,
          name,
        };
      }),
    ];
  });

  const texts = await Promise.all(
    sources.map(async (source) => {
      const text = await readLocation(source.location, options);

      if (text === null && source.required) {
        throw new Error(`the rules file ${source.label} does not exist`);
      }

      return text;
    }),
  );

  let fileText: string | null = null;

  // The sync that copies skills into a repo drops the section that links a reference it leaves out,
  // so a reference the file's text never names was not meant to be in the repo.
  return sources.map((source, index) => {
    const text = texts[index] ?? null;

    if (source.name === null) {
      fileText = text;
    }

    return {
      label: source.label,
      text,
      paths: source.paths,
      isExpected: source.name === null || fileText === null || fileText.includes(source.name),
    };
  });
}

function resolveRulesLocation(path: string, options: LoadConfigOptions): ConfigLocation {
  if (path.startsWith(REPO_PREFIX)) {
    const inner = requireInnerPath(path.slice(REPO_PREFIX.length), 'repo: path');

    return { kind: 'local', path: join(options.rulesRepoDir ?? options.repoDir, inner) };
  }

  if (path.startsWith('github:')) {
    return parseConfigLocation(path, { kind: 'local', path }, CONFIG_FILE);
  }

  return { kind: 'local', path };
}

function requireInnerPath(path: string, kind: string): string {
  const inner = normalize(path);

  if (isAbsolute(inner) || inner === '..' || inner.startsWith('../')) {
    throw new Error(`the rules ${kind} ${path} leaves the folder it is relative to`);
  }

  return inner;
}

function buildHashedConfig(config: ReviewConfig, repoDir: string): ReviewConfig {
  const root = resolve(repoDir);

  return {
    ...config,
    rules:
      config.rules?.map((file) => ({
        ...file,
        path: isLocalRulesPath(file.path) ? relative(root, resolve(file.path)) : file.path,
      })) ?? null,
  };
}

function isLocalRulesPath(path: string): boolean {
  return !path.startsWith('github:') && !path.startsWith(REPO_PREFIX);
}

function buildRules(source: RulesSource): Rule[] {
  const text = source.text?.trim() ?? '';

  return text === '' ? [] : [{ name: source.label, body: text, paths: source.paths }];
}
