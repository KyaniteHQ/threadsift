import { type Browser, browser } from "wxt/browser";
import type { z } from "zod";

import { INSTANCE_CALL_DEADLINE_MS } from "../../src/core/contract/reddit-relay-contract.ts";
import { logFailure } from "./log.ts";
import { LOOPBACK_HOSTS } from "./loopback-hosts.ts";

const LOOPBACK_SET: ReadonlySet<string> = new Set(LOOPBACK_HOSTS);

export const REDDIT_HOSTS = ["https://*.reddit.com/*"];

export const REDDIT_PERMISSIONS: Browser.permissions.Permissions = {
  permissions: ["cookies"],
  origins: REDDIT_HOSTS,
};

export function hasRedditAccess(): Promise<boolean> {
  return browser.permissions.contains({ origins: REDDIT_HOSTS });
}

export function holdsInstanceAccess(origin: string): Promise<boolean> {
  return browser.permissions.contains({ origins: [hostPattern(origin)] });
}

export function holdsRedditConnect(): Promise<boolean> {
  return browser.permissions.contains(REDDIT_PERMISSIONS);
}

export async function requestAccess(
  request: () => Promise<boolean>,
  event: string,
): Promise<boolean | null> {
  try {
    return await request();
  } catch (cause) {
    logFailure(event, cause);

    return null;
  }
}

export interface Config {
  readonly origin: string;
  readonly token: string;
}

export function instanceRequest(
  { origin, token }: Readonly<Config>,
  path: string,
  { method, body }: Readonly<{ method: string; body?: unknown }>,
): Promise<Response> {
  const headers = new Headers({ authorization: `Bearer ${token}` });

  if (body !== undefined) headers.set("content-type", "application/json");

  return fetch(new URL(path, origin), {
    method,
    headers,
    body: body === undefined ? null : JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(INSTANCE_CALL_DEADLINE_MS),
  });
}

export async function instanceAnswer<Schema extends z.ZodType>(
  response: Response,
  schema: Schema,
): Promise<z.output<Schema> | null> {
  const answer = schema.safeParse(await response.json().catch(() => null));

  return answer.success ? answer.data : null;
}

export function instanceOrigin(address: string): string | null {
  const url = URL.parse(address.trim());

  if (url === null || url.username !== "" || url.password !== "") return null;

  const isLocal = url.protocol === "http:" && LOOPBACK_SET.has(url.hostname);

  return url.protocol === "https:" || isLocal ? url.origin : null;
}

export function hostPattern(origin: string): string {
  const { protocol, hostname } = new URL(origin);

  return `${protocol}//${hostname}/*`;
}
