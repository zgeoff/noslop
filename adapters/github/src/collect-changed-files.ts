// the paths whose patch id differs between 2 keys, a file only one of them holds among them
export function collectChangedFiles(
  before: Readonly<Record<string, string>>,
  after: Readonly<Record<string, string>>,
): string[] {
  const paths = new Set([...Object.keys(before), ...Object.keys(after)]);

  return [...paths].filter((path) => before[path] !== after[path]).toSorted();
}
