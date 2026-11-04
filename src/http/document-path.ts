export function isDocumentPath(pathname: string): boolean {
  return !pathname.slice(pathname.lastIndexOf("/") + 1).includes(".");
}

export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}
