import type { PackageManifest } from './analyzed-file';

export function isInPackage(manifest: PackageManifest, path: string): boolean {
  return manifest.directory === '.' || path.startsWith(`${manifest.directory}/`);
}
