// A Markdown code span closes at the first backtick run as long as its fence, so the fence is one
// backtick longer than any run in the path.
export function formatPathCode(path: string): string {
  const escaped = path.replaceAll(
    /[\p{Cc}<>]/gu,
    (char) => `\\u${(char.codePointAt(0) ?? 0).toString(16).padStart(4, '0')}`,
  );

  const longest = Math.max(0, ...(escaped.match(/`+/gu) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longest + 1);

  return longest === 0 ? `${fence}${escaped}${fence}` : `${fence} ${escaped} ${fence}`;
}
