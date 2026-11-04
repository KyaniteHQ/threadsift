export function isDocumentPath(pathname: string): boolean {
  return !pathname.slice(pathname.lastIndexOf("/") + 1).includes(".");
}
