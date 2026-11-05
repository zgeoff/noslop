import { readPIDNamespace } from './read-pid-namespace';

export function readTempPrefix(): string {
  return `pid${process.pid}-ns${readPIDNamespace()}-`;
}
