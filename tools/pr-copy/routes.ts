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
  "/api/items",
  "/api/items/:id",
  "/api/items/:id/status",
  "/api/items/:id/digest",
  "/api/items/:id/read-state",
] as const;

export function routeTemplate(path: string): string {
  const template = path.replaceAll(/\/\d+(?=\/|$)/gu, "/:id");

  return ROUTES.find((route) => route === template) ?? "other";
}
