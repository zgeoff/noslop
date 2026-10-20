import type { PackageManifest } from './analyzed-file';

// the root manifest's directory is `.`, which holds every path in the repo
export function isInPackage(manifest: PackageManifest, path: string): boolean {
  return manifest.directory === '.' || path.startsWith(`${manifest.directory}/`);
}
