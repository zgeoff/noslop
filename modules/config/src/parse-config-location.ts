import { dirname, isAbsolute, join, normalize } from 'node:path';

export type ConfigLocation =
  | { kind: 'local'; path: string }
  | { kind: 'github'; owner: string; repo: string; path: string; ref: string | null };

const GITHUB_SPEC =
  /^github:(?<owner>[\w.-]+)\/(?<repo>[\w.-]+)(?:\/(?<path>[^@]+))?(?:@(?<ref>.+))?$/u;

export function parseConfigLocation(
  value: string,
  from: ConfigLocation,
  defaultFile: string,
): ConfigLocation {
  const match = GITHUB_SPEC.exec(value);

  if (match?.groups !== undefined) {
    return {
      kind: 'github',
      owner: match.groups['owner'] ?? '',
      repo: match.groups['repo'] ?? '',
      path: match.groups['path'] ?? defaultFile,
      ref: match.groups['ref'] ?? null,
    };
  }

  if (value.startsWith('github:')) {
    throw new Error(`"${value}" is not a github:<owner>/<repo>[/<path>][@<ref>] location`);
  }

  if (from.kind === 'local') {
    return { kind: 'local', path: isAbsolute(value) ? value : join(dirname(from.path), value) };
  }

  return { ...from, path: normalize(join(dirname(from.path), value)) };
}
