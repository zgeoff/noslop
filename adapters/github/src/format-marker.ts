export type MarkerKind = 'finding' | 'summary' | 'forms' | 'follow-up';

// the JSON escapes of `>` and `<`, built from their parts so no formatter folds them back
const ESCAPED_GREATER_THAN = `${String.fromCodePoint(92)}u003e`;
const ESCAPED_LESS_THAN = `${String.fromCodePoint(92)}u003c`;

// An HTML comment ends at the first `-->`, so every `>` in the JSON is escaped and no title or
// reason can end the marker early. Every `<` is escaped too, so no marker holds the start of another.
export function formatMarker(kind: MarkerKind, state: unknown): string {
  const json = JSON.stringify(state)
    .replaceAll('>', ESCAPED_GREATER_THAN)
    .replaceAll('<', ESCAPED_LESS_THAN);

  return `<!-- noslop:${kind} ${json} -->`;
}
