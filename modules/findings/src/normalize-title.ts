export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replaceAll(/[^\p{L}\s]/gu, ' ')
    .replaceAll(/\s+/gu, ' ')
    .trim();
}
