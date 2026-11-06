const SPECIFIED_PUBLIC = new Set([
  "GET /api/session",
  "POST /api/setup/code",
  "POST /api/setup",
  "POST /api/login",
  "POST /api/password/reset",
]);

export function isSpecifiedPublic(method: string, path: string): boolean {
  return SPECIFIED_PUBLIC.has(`${method.toUpperCase()} ${path}`);
}
