// Bun imports a Markdown file as its text when the import names the text type
declare module '*.md' {
  const text: string;
  export default text;
}
