import { type Browser, browser } from "wxt/browser";

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1"]);

export const REDDIT_HOSTS = ["https://*.reddit.com/*"];

export const FILL_SCRIPT_ID = "fill";

export const RELAY_SCRIPT_ID = "relay";

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

export const REQUEST_DEADLINE_MS = 25_000;

export const REDDIT_DEADLINE_MS = 30_000;

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
    signal: AbortSignal.timeout(REQUEST_DEADLINE_MS),
  });
}

export function instanceOrigin(address: string): string | null {
  const url = URL.parse(address.trim());

  if (url === null || url.username !== "" || url.password !== "") return null;

  const isLocal = url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);

  return url.protocol === "https:" || isLocal ? url.origin : null;
}

export function hostPattern(origin: string): string {
  const { protocol, hostname } = new URL(origin);

  return `${protocol}//${hostname}/*`;
}

export function storeOrigin(origin: string): Promise<void> {
  return browser.storage.local.set({ instance: origin });
}

export function storeConfig({ origin, token }: Readonly<Config>): Promise<void> {
  return browser.storage.local.set({ instance: origin, token });
}

export function storeFill(on: boolean): Promise<void> {
  return browser.storage.local.set({ fill: on });
}

export async function restrictStorage(): Promise<void> {
  if ("setAccessLevel" in browser.storage.local) {
    await browser.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  }
}
