export type MarkerKind = 'finding' | 'summary' | 'forms' | 'follow-up';

// the JSON escape of `>`, built from its parts so no formatter folds it back into a bare `>`
const ESCAPED_GREATER_THAN = `${String.fromCodePoint(92)}u003e`;

// An HTML comment ends at the first `-->`, so every `>` in the JSON is escaped and no title or
// reason can end the marker early.
export function formatMarker(kind: MarkerKind, state: unknown): string {
  return `<!-- noslop:${kind} ${JSON.stringify(state).replaceAll('>', ESCAPED_GREATER_THAN)} -->`;
}
