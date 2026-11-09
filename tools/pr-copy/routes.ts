const ROUTES = [
  "/api/session",
  "/api/setup/code",
  "/api/setup",
  "/api/login",
  "/api/password",
  "/api/password/reset",
  "/api/logout",
  "/api/tokens",
  "/api/tokens/:id",
  "/api/settings/ai",
  "/api/settings/ai/verify",
  "/api/settings/ai/openrouter/start",
  "/api/settings/ai/openrouter/callback",
  "/api/settings/github",
  "/api/settings/github/verify",
  "/api/items",
  "/api/items/:id",
  "/api/items/:id/status",
  "/api/items/:id/digest",
  "/api/items/:id/read-state",
  "/api/items/:id/highlights",
  "/api/items/:id/highlights/:highlightId",
  "/api/items/:id/note",
  "/api/files/items/:id/:name",
] as const;

const PARAMETER = /:[A-Za-z]+/gu;

const PATTERNS = ROUTES.map((route) => ({
  route,
  pattern: new RegExp(`^${route.replaceAll(PARAMETER, String.raw`(?:\d+|:[A-Za-z]+)`)}$`, "u"),
}));

export function routeTemplate(path: string): string {
  return PATTERNS.find(({ pattern }) => pattern.test(path))?.route ?? "other";
}
