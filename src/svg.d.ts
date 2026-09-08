// Vite inlines `?raw` imports as the file's text content.
declare module '*.svg?raw' {
  const content: string;
  export default content;
}
