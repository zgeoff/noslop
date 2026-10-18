// a path comes from the change under review, so it can hold Markdown, a mention, a marker, a line
// break or text meant for a model; each control character and angle bracket becomes an escape, and a
// code span whose backtick fence is longer than any backtick run inside it wraps the path
export function formatPathCode(path: string): string {
  const escaped = path.replaceAll(
    /[\p{Cc}<>]/gu,
    (char) => `\\u${(char.codePointAt(0) ?? 0).toString(16).padStart(4, '0')}`,
  );

  const longest = Math.max(0, ...(escaped.match(/`+/gu) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longest + 1);

  return longest === 0 ? `${fence}${escaped}${fence}` : `${fence} ${escaped} ${fence}`;
}
