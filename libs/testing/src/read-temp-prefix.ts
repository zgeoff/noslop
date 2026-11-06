import { buildTempPrefix } from './build-temp-prefix';
import { PID_NAMESPACE_LINK, readPIDNamespace } from './read-pid-namespace';

export function readTempPrefix(): string {
  return buildTempPrefix(process.pid, readPIDNamespace(PID_NAMESPACE_LINK));
}
