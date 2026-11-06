import { readlinkSync } from 'node:fs';

export const PID_NAMESPACE_LINK = '/proc/self/ns/pid';

// Linux names the PID namespace as `pid:[<inode>]`; a sandbox with its own namespace can share the
// temp folder, so the PID alone does not name the run that made a folder. A system with no procfs,
// such as macOS, has no such link.
export function readPIDNamespace(link: string): string {
  try {
    return readlinkSync(link).slice('pid:['.length, -1);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return 'none';
    }

    throw error;
  }
}
