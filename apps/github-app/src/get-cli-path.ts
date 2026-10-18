import { join } from 'node:path';

// the `noslop` bin that the App's @noslop/cli dependency installs, the one entry the jobs run
export function getCLIPath(): string {
  return join(import.meta.dir, '..', 'node_modules', '.bin', 'noslop');
}
