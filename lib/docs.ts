/**
 * Public documentation. Override at build time with NEXT_PUBLIC_CYGNUS_DOCS_URL
 * if the docs move to a different host.
 */
export const DOCS_URL =
  process.env.NEXT_PUBLIC_CYGNUS_DOCS_URL || "https://cygnus-docs-npm1cz.freebuff.site";

export function docsPage(path: string): string {
  return `${DOCS_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}
