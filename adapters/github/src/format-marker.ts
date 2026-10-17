export type MarkerKind = 'finding' | 'summary' | 'forms';

// the JSON escape of `>`, built from its parts so no formatter folds it back into a bare `>`
const ESCAPED_GREATER_THAN = `${String.fromCodePoint(92)}u003e`;

// noslop keeps its own state on GitHub as a hidden comment at the end of what it posts: the kind, then
// the state as JSON with every `>` escaped, so no title or reason can end the comment early
export function formatMarker(kind: MarkerKind, state: unknown): string {
  return `<!-- noslop:${kind} ${JSON.stringify(state).replaceAll('>', ESCAPED_GREATER_THAN)} -->`;
}
