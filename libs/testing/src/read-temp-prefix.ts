import { PID_NAMESPACE_LINK, readPIDNamespace } from './read-pid-namespace';

export function readTempPrefix(): string {
  return `pid${process.pid}-ns${readPIDNamespace(PID_NAMESPACE_LINK)}-`;
}
