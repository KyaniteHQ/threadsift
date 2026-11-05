const SPECIFIED_PUBLIC = new Set([
  "GET /api/session",
  "POST /api/setup/code",
  "POST /api/setup",
  "POST /api/login",
]);

export function isSpecifiedPublic(method: string, path: string): boolean {
  return SPECIFIED_PUBLIC.has(`${method.toUpperCase()} ${path}`);
}
