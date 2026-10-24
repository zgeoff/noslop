// Bun imports a file with `type: 'text'` as a string of its contents and inlines it in a bundle.
declare module '*.md' {
  const text: string;
  export default text;
}
