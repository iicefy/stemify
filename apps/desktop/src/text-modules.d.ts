// Files bundled as plain strings (esbuild's "text" loader, see scripts/bundle.mjs).
declare module "*.sh" {
  const text: string;
  export default text;
}
