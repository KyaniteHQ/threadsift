export interface PublicRoute {
  readonly method: string;
  readonly path: string;
}

export const PUBLIC_ROUTES: readonly PublicRoute[] = [
  { method: "GET", path: "/api/session" },
  { method: "POST", path: "/api/setup/code" },
  { method: "POST", path: "/api/setup" },
  { method: "POST", path: "/api/login" },
  { method: "POST", path: "/api/password/reset" },
];

const OWNER_ONLY_PATH =
  /^\/api\/(?:(?:tokens|logout|settings|password)(?:\/|$)|items\/[^/]+\/(?:read-state$|note$|highlights(?:\/|$)))/u;

export function isPublic(method: string, path: string): boolean {
  return PUBLIC_ROUTES.some((route) => route.method === method && route.path === path);
}

export function isOwnerOnly(path: string): boolean {
  return OWNER_ONLY_PATH.test(path);
}
