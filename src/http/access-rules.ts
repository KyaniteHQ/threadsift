import type { Scope } from "../core/kinds.ts";

interface PublicRoute {
  readonly method: string;
  readonly path: string;
}

const PUBLIC_ROUTES: readonly PublicRoute[] = [
  { method: "GET", path: "/api/session" },
  { method: "POST", path: "/api/setup/code" },
  { method: "POST", path: "/api/setup" },
  { method: "POST", path: "/api/login" },
  { method: "POST", path: "/api/password/reset" },
];

const OWNER_ONLY_PATH =
  /^\/api\/(?:(?:tokens|logout|settings|password)(?:\/|$)|items\/[^/]+\/(?:read-state$|note$|highlights(?:\/|$))|proposals\/[^/]+\/(?:accept|reject)$)/u;

export function isPublic(method: string, path: string): boolean {
  return PUBLIC_ROUTES.some((route) => route.method === method && route.path === path);
}

export function isOwnerOnly(path: string): boolean {
  return OWNER_ONLY_PATH.test(path);
}

interface ScopedRoute {
  readonly method: string;
  readonly path: RegExp;
  readonly scope: Scope;
}

const SCOPED_ROUTES: readonly ScopedRoute[] = [
  { method: "POST", path: /^\/api\/items$/u, scope: "add" },
  { method: "POST", path: /^\/api\/items\/batch$/u, scope: "add" },
  { method: "POST", path: /^\/api\/items\/[^/]+\/digest$/u, scope: "digest" },
  { method: "POST", path: /^\/api\/topics\/[^/]+\/overview$/u, scope: "digest" },
  { method: "DELETE", path: /^\/api\/items\/[^/]+$/u, scope: "delete" },
];

export function requiredScope(method: string, path: string): Scope | undefined {
  if (method === "GET" || method === "HEAD") {
    return "read";
  }

  return SCOPED_ROUTES.find((route) => route.method === method && route.path.test(path))?.scope;
}
