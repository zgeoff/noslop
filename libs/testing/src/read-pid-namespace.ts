import { readlinkSync } from 'node:fs';

// Linux names the PID namespace as `pid:[<inode>]`; a sandbox with its own namespace can share the
// temp folder, so the PID alone does not name the run that made a folder.
export function readPIDNamespace(): string {
  return readlinkSync('/proc/self/ns/pid').slice('pid:['.length, -1);
}
