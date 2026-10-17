import type { ConfigLocation } from './parse-config-location';

// the label a location takes as the source of a config key
export function formatConfigLocation(location: ConfigLocation): string {
  if (location.kind === 'local') {
    return location.path;
  }

  const ref = location.ref === null ? '' : `@${location.ref}`;

  return `github:${location.owner}/${location.repo}/${location.path}${ref}`;
}
