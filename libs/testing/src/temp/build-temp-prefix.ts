export function buildTempPrefix(pid: number, namespace: string): string {
  return `pid${pid}-ns${namespace}-`;
}
