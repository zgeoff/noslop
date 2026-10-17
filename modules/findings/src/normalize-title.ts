// a title in lowercase letters and single spaces, with digits and punctuation gone, so 2 wordings of
// one title that differ only in a line number or a quote match
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replaceAll(/[^\p{L}\s]/gu, ' ')
    .replaceAll(/\s+/gu, ' ')
    .trim();
}
