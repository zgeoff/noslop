// a prompt page imported with `type: 'text'` is its text, which the bundler inlines, so a bundled CLI
// reads no prompt file at run time
declare module '*.md' {
  const text: string;
  export default text;
}
