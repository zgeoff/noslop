import { join } from 'node:path';

export function getCLIPath(): string {
  return join(import.meta.dir, '..', 'node_modules', '.bin', 'noslop');
}
