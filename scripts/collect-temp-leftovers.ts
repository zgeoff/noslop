export interface TempLeftover {
  name: string;
  pid: number;
}

const RUN_PREFIX = /^pid(?<pid>\d+)-ns(?<namespace>\d+)-/u;

export function collectTempLeftovers(names: readonly string[], namespace: string): TempLeftover[] {
  return names.flatMap((name) => {
    const groups = RUN_PREFIX.exec(name)?.groups;

    return groups?.['namespace'] === namespace ? [{ name, pid: Number(groups['pid']) }] : [];
  });
}
