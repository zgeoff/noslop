export type MarkerKind = 'finding' | 'summary' | 'forms';

// noslop keeps its own state on GitHub as a hidden comment at the end of what it posts: the kind, then
// the state as JSON with every `>` escaped, so no title or reason can end the comment early
export function formatMarker(kind: MarkerKind, state: unknown): string {
  return `<!-- noslop:${kind} ${JSON.stringify(state).replaceAll('>', String.raw`>`)} -->`;
}
