import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import type { Ports } from "../core/ports.ts";
import { SESSION_MAX_AGE_SECONDS, checkSession } from "../core/sessions.ts";

const COOKIE_NAME = "threadsift_session";

const ATTRIBUTES = {
  prefix: "host",
  httpOnly: true,
  secure: true,
  sameSite: "Lax",
  path: "/",
} as const;

export function sessionIdOf(c: Context): string | undefined {
  return getCookie(c, COOKIE_NAME, "host");
}

export function sendSession(c: Context, id: string, maxAge: number): void {
  setCookie(c, COOKIE_NAME, id, { ...ATTRIBUTES, maxAge });
}

export function clearSession(c: Context): void {
  deleteCookie(c, COOKIE_NAME, ATTRIBUTES);
}

export async function ownerHasSession(c: Context, ports: Ports): Promise<boolean> {
  const id = sessionIdOf(c);

  if (id === undefined) {
    return false;
  }

  const check = await checkSession(ports, id);

  if (check.valid && check.renewed) {
    sendSession(c, id, SESSION_MAX_AGE_SECONDS);
  }

  return check.valid;
}
